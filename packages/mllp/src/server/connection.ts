/**
 * One MLLP connection over any runtime's socket.
 *
 * `VT MSH|…|ADT^A01|… FS CR` arrives on `readable`; `unframe()` gives the
 * message bytes to `handle`; its reply goes back on `writable` as
 * `VT MSH|…|ACK^A01^ACK|… FS CR`. One message at a time, until the remote
 * system closes the connection or the signal aborts.
 *
 * @module
 */

import { frame, MllpCodecError, unframe } from "@glion/mllp-codec";
import { encodeBytes } from "@glion/util-charset";

import { MllpServerError, MllpServerErrorCode } from "../errors";
import type { Response } from "./types";

/** An accepted connection, as Web Streams. */
export interface MllpSocket {
  /** The bytes the remote system sends. */
  readonly readable: ReadableStream<Uint8Array>;
  /** The bytes sent to the remote system. */
  readonly writable: WritableStream<Uint8Array>;
  /**
   * Ends the socket; a pending read of `readable` then finishes. MUST NOT
   * throw. MUST be idempotent.
   */
  close(): void;
}

/** Options for {@link handleConnection}. */
export interface HandleConnectionOptions {
  /**
   * Ends the connection once the message in progress, if any, has been
   * answered. A message read after it aborts is not handled.
   */
  signal?: AbortSignal;
}

/**
 * Handles every message the remote system sends on `socket` with `handle`,
 * and writes each reply back with MLLP framing.
 *
 * Resolves once the connection has closed: the remote system closed or reset
 * it, or `signal` aborted. Closes `socket` either way.
 *
 * @param handle - Replies to one message, given without MLLP framing. Called
 *   once per message, never concurrently.
 * @param socket - The accepted connection.
 * @param options - The signal that ends the connection.
 * @throws {MllpServerError} `PROTOCOL_VIOLATION` when the bytes break MLLP
 *   framing: the remote system's, or a reply that carries a VT or FS byte.
 * @throws What `handle` throws.
 */
export async function handleConnection(
  handle: (payload: Uint8Array) => Promise<Response | undefined>,
  socket: MllpSocket,
  options: HandleConnectionOptions = {}
): Promise<void> {
  const { signal } = options;
  const reader = socket.readable.pipeThrough(unframe()).getReader();
  const writer = socket.writable.getWriter();

  let handling = false;
  // Mid-message, the loop ends the socket once the reply is written.
  const end = () => {
    if (!handling) {
      socket.close();
    }
  };
  signal?.addEventListener("abort", end, { once: true });
  if (signal?.aborted) {
    end();
  }

  try {
    for (;;) {
      const payload = await receive(reader);
      if (!payload || signal?.aborted) {
        break;
      }
      handling = true;
      const reply = await handle(payload);
      if (reply && !(await send(writer, reply))) {
        break;
      }
      handling = false;
      if (signal?.aborted) {
        break;
      }
    }
  } finally {
    signal?.removeEventListener("abort", end);
    reader.releaseLock();
    writer.releaseLock();
    socket.close();
  }
}

/**
 * The next message, or `undefined` once the remote system has closed the
 * connection or the transport has failed.
 */
async function receive(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<Uint8Array | undefined> {
  try {
    const { done, value } = await reader.read();
    return done ? undefined : value;
  } catch (error) {
    if (error instanceof MllpCodecError) {
      throw new MllpServerError(MllpServerErrorCode.PROTOCOL_VIOLATION, {
        cause: error,
      });
    }
    // A reset or a teardown ends the connection as a close does; the
    // transport, not the message, failed.
    return undefined;
  }
}

/** Writes `reply` with MLLP framing; `false` when the transport has failed. */
async function send(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reply: Response
): Promise<boolean> {
  try {
    await writer.write(frame(encodeBytes(reply.raw)));
    return true;
  } catch (error) {
    if (error instanceof MllpCodecError) {
      throw new MllpServerError(MllpServerErrorCode.PROTOCOL_VIOLATION, {
        cause: error,
      });
    }
    // As in receive(): the connection is gone.
    return false;
  }
}
