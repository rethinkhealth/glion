/**
 * One session over a socket: the message layer over its bytes. A message
 * written here is framed, and bytes read here are unframed.
 *
 * @module
 */

import { MllpCodecError, frame, unframe } from "@glion/mllp-codec";

import {
  MllpConnectionFailedError,
  MllpConnectionTimeoutError,
  MllpConnectionLostError,
  MllpInvalidMessageError,
  MllpSendAbortedError,
  MllpSendTimeoutError,
} from "../errors";
import type { MllpSocket, MllpStreams } from "../types";

/**
 * One session over one socket, for that socket's lifetime. `ready` resolves
 * once it is open; `destroy()` ends it from any point.
 */
export interface MllpSession {
  /**
   * Resolves once the session is open. Rejects with
   * {@link MllpConnectionFailedError} or {@link MllpConnectionTimeoutError};
   * when destroyed while opening, with the former, and only once the socket
   * is down. The owner MUST await it, or observe it, before destroying a
   * session that has not opened.
   */
  readonly ready: Promise<void>;
  /**
   * Sends one message, once the session is open, and returns the next one the
   * remote system sends back, unframed. `timeoutMs` bounds the write and the
   * wait for the reply; it does not cover the opening.
   *
   * @throws {MllpInvalidMessageError} The message contains a reserved MLLP
   *   byte, so nothing was written.
   * @throws {MllpConnectionFailedError} The session never opened.
   * @throws {MllpConnectionTimeoutError} The session never opened in time.
   * @throws {MllpSendTimeoutError} Nothing came back within `timeoutMs`. The
   *   session is destroyed.
   * @throws {MllpSendAbortedError} `destroy()` ended the session while the
   *   reply was awaited.
   * @throws {MllpConnectionLostError} The remote system closed, or the stream
   *   failed, before a reply came.
   * @throws {MllpCodecError} The remote system sent bytes that are not an MLLP
   *   frame.
   */
  exchange(message: Uint8Array, timeoutMs: number): Promise<Uint8Array>;
  /**
   * Ends the session now, and resolves once the socket is down. A `ready`
   * still pending rejects; so does an `exchange` still waiting.
   *
   * Never rejects. Idempotent. Bounded.
   */
  destroy(): Promise<void>;
}

export interface ConnectOptions {
  /** Time the remote system has to accept the connection. */
  readonly timeoutMs: number;
  /** Maximum bytes buffered while reading one frame. */
  readonly maxBufferedBytes: number;
}

/** The socket's streams, framed and locked for this session's use. */
interface Framing {
  readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  readonly writer: WritableStreamDefaultWriter<Uint8Array>;
}

/**
 * Opens `socket` and takes ownership of its streams.
 *
 * @throws {MllpConnectionTimeoutError} No socket within `timeoutMs`.
 * @throws {MllpConnectionFailedError} The socket failed to open, or `signal`
 *   cancelled the attempt; the adapter's rejection is on `cause`.
 */
async function openSocketStreams(
  socket: MllpSocket,
  signal: AbortSignal,
  opts: ConnectOptions
): Promise<Framing> {
  const timeout = AbortSignal.timeout(opts.timeoutMs);

  let streams: MllpStreams;
  try {
    streams = await socket.connect(AbortSignal.any([signal, timeout]));
  } catch (error) {
    if (timeout.aborted) {
      throw new MllpConnectionTimeoutError(opts.timeoutMs);
    }
    throw new MllpConnectionFailedError(error);
  }

  try {
    return {
      reader: streams.readable
        .pipeThrough(unframe({ maxBufferedBytes: opts.maxBufferedBytes }))
        .getReader(),
      writer: streams.writable.getWriter(),
    };
  } catch (error) {
    // `destroy` ends only an attempt that fulfilled; this one is about to reject.
    await socket.close();
    throw new MllpConnectionFailedError(error);
  }
}

/**
 * Starts opening a session over `socket`, and hands it back at once. The
 * session ends itself when `signal` aborts.
 *
 * Never throws: every failure, an adapter's synchronous throw included,
 * reaches `ready`. Nothing is left open on any path: an attempt that fails or
 * is cancelled closes the socket before `ready` rejects.
 */
export function createSession(
  socket: MllpSocket,
  opts: ConnectOptions,
  signal?: AbortSignal
): MllpSession {
  const abort = new AbortController();
  const streams = openSocketStreams(socket, abort.signal, opts);
  let closing: Promise<void> | null = null;
  const cancel = () => void destroy();

  const ready = (async () => {
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      await streams;
    } catch (error) {
      signal?.removeEventListener("abort", cancel);
      throw error;
    }
    if (closing !== null) {
      // Destroyed while opening: the socket is down before this settles.
      await closing;
      throw new MllpConnectionFailedError(abort.signal.reason);
    }
  })();

  const destroy = (): Promise<void> => {
    closing ??= (async () => {
      // Aborting cancels a dial still in flight, through the signal the
      // adapter was given, and marks the session as ended, so that a read or
      // write released below reports SEND_ABORTED rather than a stream error.
      abort.abort();
      signal?.removeEventListener("abort", cancel);
      // Opening settles either way once aborted. An open that failed has
      // already closed whatever it opened; only one that succeeded leaves
      // streams to release and a socket to close.
      const [opened] = await Promise.allSettled([streams]);
      if (opened.status === "fulfilled") {
        // Release the streams, do not cancel them: cancelling would destroy
        // the socket under the adapter and skip its graceful close.
        opened.value.reader.releaseLock();
        opened.value.writer.releaseLock();
        await socket.close();
      }
    })();
    return closing;
  };

  const exchange = async (
    message: Uint8Array,
    timeoutMs: number
  ): Promise<Uint8Array> => {
    let framed: Uint8Array;
    try {
      framed = frame(message);
    } catch (error) {
      // Raised before the writer is touched: nothing reached the wire.
      throw new MllpInvalidMessageError(error);
    }

    await ready;

    // Destroying is what wakes the read parked below. `clearTimeout` runs in a
    // microtask and this fires as a macrotask, so a deadline that fires at all
    // is one whose exchange is still in flight.
    let timedOut = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      void destroy();
    }, timeoutMs);
    try {
      const { reader, writer } = await streams;
      await writer.write(framed);
      const reply = await reader.read();
      if (reply.done) {
        throw new MllpConnectionLostError();
      }
      return reply.value;
    } catch (error) {
      if (timedOut) {
        throw new MllpSendTimeoutError(timeoutMs);
      }
      if (abort.signal.aborted) {
        throw new MllpSendAbortedError();
      }
      throw error instanceof MllpCodecError ||
        error instanceof MllpConnectionLostError
        ? error
        : new MllpConnectionLostError(error);
    } finally {
      clearTimeout(deadline);
    }
  };

  return { destroy, exchange, ready };
}
