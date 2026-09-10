/**
 * The message layer over a byte socket.
 *
 * An {@link MllpSocket} carries bytes; MLLP carries messages, delimited by the
 * frame bytes. This is the boundary between the two, both ways: a message
 * written here is framed, and bytes read here are unframed. An adapter never
 * sees a frame.
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
 * One session over a socket, from opening it to ending it. It exists before it
 * is open: `ready` says when it is, and `destroy()` ends it from any point.
 */
export interface MllpConnection {
  /**
   * Resolves once the connection is open and rejects if it never opens.
   * `exchange` is usable only after it resolves.
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
   *   connection is destroyed.
   * @throws {MllpCodecError} The remote system sent bytes that are not an MLLP
   *   frame.
   */
  exchange(message: Uint8Array, timeoutMs: number): Promise<Uint8Array | null>;
  /**
   * Ends the connection now, and resolves once the socket is down. `ready` and
   * a waiting `exchange` both reject with `reason`.
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

/** The socket's streams, framed and locked for this connection's use. */
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

  return {
    reader: streams.readable
      .pipeThrough(unframe({ maxBufferedBytes: opts.maxBufferedBytes }))
      .getReader(),
    writer: streams.writable.getWriter(),
  };
}

/**
 * Starts opening a connection over `socket`, and hands it back at once.
 *
 * Nothing is left open on any path: an attempt that fails or is cancelled
 * closes the socket before `ready` rejects.
 */
export function createConnection(
  socket: MllpSocket,
  opts: ConnectOptions
): MllpConnection {
  const abort = new AbortController();
  const streams = openSocketStreams(socket, abort.signal, opts);
  const ready = (async () => {
    await streams;
  })();
  let closing: Promise<void> | null = null;

  const destroy = (reason?: unknown): Promise<void> => {
    closing ??= (async () => {
      abort.abort(reason);
      // Waited for, not read: the attempt's failure belongs to whoever
      // awaited `ready`. Both promises are listed so neither is left
      // unhandled when nobody did.
      const [attempt] = await Promise.allSettled([streams, ready]);
      // An attempt that failed closed the socket before it rejected, so
      // only one that opened has anything left to end.
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

  const exchange = async (
    message: Uint8Array,
    timeoutMs: number
  ): Promise<Uint8Array | null> => {
    let framed: Uint8Array;
    try {
      framed = frame(message);
    } catch (error) {
      // Raised before the writer is touched, so nothing reached the wire and
      // the connection is still in step.
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
