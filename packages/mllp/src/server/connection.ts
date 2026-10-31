/**
 * One MLLP connection over any runtime's socket.
 *
 * `VT MSH|…|ADT^A01|… FS CR` arrives on `readable`; `unframe()` gives the
 * message bytes to `handle`; its response goes back on `writable` as
 * `VT MSH|…|ACK^A01^ACK|… FS CR`. One message at a time, until the remote
 * system closes the connection or the signal aborts.
 *
 * @module
 */

import { frame, MllpCodecError, unframe } from "@glion/mllp-codec";

import { MllpServerError, MllpServerErrorCode } from "../errors";

/**
 * An accepted connection, as Web Streams.
 *
 * `writable` MUST keep accepting writes after `readable` ends or is
 * cancelled, until `close()`: the remote system can close its side before
 * every reply is written, and the signal can stop the reading while a reply
 * is still to be written. Cancelling `readable` MUST NOT end the socket.
 *
 * Once the connection is torn down (a reset, a broken pipe, a timeout),
 * `readable` MUST error with `MllpServerError` `CONNECTION_LOST`, and a write
 * to `writable` MUST resolve. Any other error the streams raise is a fault
 * `handleConnection` rejects with.
 */
export interface MllpSocket {
  /** The bytes the remote system sends. */
  readonly readable: ReadableStream<Uint8Array>;
  /** The bytes sent to the remote system. */
  readonly writable: WritableStream<Uint8Array>;
  /** Ends the socket. MUST NOT throw. MUST be idempotent. */
  close(): void;
}

/** Options for {@link handleConnection}. */
export interface HandleConnectionOptions {
  /**
   * Stops reading the connection: the message in progress, if any, is
   * answered, and the connection then closes. A message not yet read in full
   * is not handled, and not reported.
   */
  signal?: AbortSignal;
}

/**
 * Handles every message the remote system sends on `socket` with `handle`,
 * and writes each response back with MLLP framing.
 *
 * Resolves once the connection has closed: the remote system closed it, it
 * was lost, or `signal` aborted. Closes `socket` either way.
 *
 * @param handle - The response to one message, both without MLLP framing, or
 *   `undefined` for none. Called once per message, never concurrently.
 * @param socket - The accepted connection.
 * @param options - The signal that ends the connection.
 * @throws {MllpServerError} `PROTOCOL_VIOLATION` when the remote system's bytes
 *   break MLLP framing, and `UNFRAMEABLE_RESPONSE` when a response carries a VT
 *   or FS byte.
 * @throws What `handle` throws, and any error of `socket` other than its
 *   teardown.
 */
export async function handleConnection(
  handle: (payload: Uint8Array) => Promise<Uint8Array | undefined>,
  socket: MllpSocket,
  options: HandleConnectionOptions = {}
): Promise<void> {
  const { signal } = options;
  // `VT MSH|…|ADT^A01|… FS CR` on the wire is read as `MSH|…|ADT^A01|…`:
  // unframe() yields one payload per frame, however the bytes were chunked.
  // An abort stops the reading here, and drops a message still arriving.
  const reader = socket.readable.pipeThrough(unframe(), { signal }).getReader();
  const writer = socket.writable.getWriter();

  try {
    // One message at a time: read, handle, write, then read the next.
    for (;;) {
      // `undefined` once the remote system has closed its side, the
      // connection is lost, or the signal has aborted.
      const payload = await receive(reader, signal);
      if (!payload) {
        break;
      }
      const reply = await handle(payload);
      // `undefined` sends nothing; the next message is read all the same.
      if (reply) {
        await writer.write(framed(reply));
      }
    }
  } finally {
    // Reached on a close, an abort, or a throw from handle() or the socket.
    reader.releaseLock();
    writer.releaseLock();
    socket.close();
  }
}

/**
 * The next message, or `undefined` once the remote system has closed its side,
 * the connection is lost, or `signal` has aborted.
 */
async function receive(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal | undefined
): Promise<Uint8Array | undefined> {
  try {
    const { done, value } = await reader.read();
    return done ? undefined : value;
  } catch (error) {
    // The pipe rejects with the signal's own reason once it aborts.
    if (signal?.aborted && error === signal.reason) {
      return undefined;
    }
    // A lost connection drops the messages still queued, and a message cut
    // off by it is not the sender's framing.
    if (
      error instanceof MllpServerError &&
      error.code === MllpServerErrorCode.CONNECTION_LOST
    ) {
      return undefined;
    }
    // unframe() rejects bytes before a VT, a VT inside a message, a message
    // past its size limit, and a stream that ends mid-message. Other errors
    // are the socket's, and pass through unchanged.
    if (error instanceof MllpCodecError) {
      throw new MllpServerError(MllpServerErrorCode.PROTOCOL_VIOLATION, {
        cause: error,
      });
    }
    throw error;
  }
}

/** `reply` with MLLP framing. */
function framed(reply: Uint8Array): Uint8Array {
  try {
    // `MSH|…|ACK^A01^ACK|…` is written as `VT MSH|…|ACK^A01^ACK|… FS CR`.
    return frame(reply);
  } catch (error) {
    // frame() rejects a response that holds a VT or an FS byte.
    if (error instanceof MllpCodecError) {
      throw new MllpServerError(MllpServerErrorCode.UNFRAMEABLE_RESPONSE, {
        cause: error,
      });
    }
    throw error;
  }
}
