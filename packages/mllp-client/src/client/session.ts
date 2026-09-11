/**
 * One session over a socket: the message layer over its bytes. A message
 * written here is framed, and bytes read here are unframed.
 *
 * @module
 */

import { frame, unframe } from "@glion/mllp-codec";

import {
  MllpConnectFailedError,
  MllpConnectTimeoutError,
  MllpInvalidMessageError,
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
   * {@link MllpConnectFailedError}, {@link MllpConnectTimeoutError}, or the
   * reason `destroy()` was given; when destroyed while opening, only once the
   * socket is down. `exchange` is usable only after it resolves.
   */
  readonly ready: Promise<void>;
  /**
   * Sends one message and returns the next one the remote system sends back,
   * unframed, within `timeoutMs`. `null` once the remote system has closed and
   * every message it sent has been read.
   *
   * @throws {MllpInvalidMessageError} The message contains a reserved MLLP
   *   byte, so nothing was written.
   * @throws {MllpSendTimeoutError} Nothing came back within `timeoutMs`. The
   *   session is destroyed.
   * @throws {MllpCodecError} The remote system sent bytes that are not an MLLP
   *   frame.
   */
  exchange(message: Uint8Array, timeoutMs: number): Promise<Uint8Array | null>;
  /**
   * Ends the session now, and resolves once the socket is down. `ready` and a
   * waiting `exchange` both reject with `reason`.
   *
   * Never rejects. Idempotent. Bounded.
   */
  destroy(reason?: unknown): Promise<void>;
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
 * @throws `signal.reason` when the caller cancelled.
 * @throws {MllpConnectTimeoutError} No socket within `timeoutMs`.
 * @throws {MllpConnectFailedError} The socket failed to open.
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
    if (signal.aborted) {
      throw signal.reason;
    }
    if (timeout.aborted) {
      throw new MllpConnectTimeoutError(opts.timeoutMs);
    }
    throw new MllpConnectFailedError(error);
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
    throw new MllpConnectFailedError(error);
  }
}

/**
 * Starts opening a session over `socket`, and hands it back at once. The
 * session ends itself, with `signal.reason`, when `signal` aborts.
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
  const cancel = () => void destroy(signal?.reason);
  let closing: Promise<void> | null = null;

  const destroy = (reason?: unknown): Promise<void> => {
    closing ??= (async () => {
      abort.abort(reason);
      signal?.removeEventListener("abort", cancel);
      // Handled here for an owner that never awaits `ready`; the failure is
      // still theirs to read.
      void Promise.allSettled([ready]);
      const [attempt] = await Promise.allSettled([streams]);
      if (attempt.status === "fulfilled") {
        // Release the streams, do not cancel them: cancelling would destroy
        // the socket under the adapter and skip its graceful close.
        attempt.value.reader.releaseLock();
        attempt.value.writer.releaseLock();
        await socket.close();
      }
    })();
    return closing;
  };

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
      throw abort.signal.reason;
    }
  })();

  const exchange = async (
    message: Uint8Array,
    timeoutMs: number
  ): Promise<Uint8Array | null> => {
    let framed: Uint8Array;
    try {
      framed = frame(message);
    } catch (error) {
      // Raised before the writer is touched: nothing reached the wire.
      throw new MllpInvalidMessageError(error);
    }

    // Destroying is what wakes the read parked below. `clearTimeout` runs in a
    // microtask and this fires as a macrotask, so a deadline that fires at all
    // is one whose exchange is still in flight.
    const deadline = setTimeout(() => {
      void destroy(new MllpSendTimeoutError(timeoutMs));
    }, timeoutMs);
    try {
      const { reader, writer } = await streams;
      await writer.write(framed);
      const reply = await reader.read();
      return reply.done ? null : reply.value;
    } catch (error) {
      // `destroy` released the lock under us: report why it ended, not how.
      throw abort.signal.aborted ? abort.signal.reason : error;
    } finally {
      clearTimeout(deadline);
    }
  };

  return { destroy, exchange, ready };
}
