/**
 * The message layer over a byte socket.
 *
 * An {@link MllpSocket} carries bytes. MLLP carries messages, delimited by the
 * frame bytes. This is the boundary between the two, and it is the same on
 * every runtime, which is why an adapter never sees a frame.
 *
 * @module
 */

import { unframe } from "@glion/mllp-codec";

import { MllpConnectFailedError, MllpConnectTimeoutError } from "../errors";
import type { MllpSocket, MllpStreams } from "../types";

/**
 * One session over a socket: send a message, read the next one, end it. Owns
 * the socket's streams for as long as it is open.
 */
export interface MllpConnection {
  /** Writes one complete MLLP frame. */
  write(framed: Uint8Array): Promise<void>;
  /**
   * The next message from the remote system, unframed, or `null` once it has
   * closed and every message it sent has been read.
   *
   * Rejects with `MllpCodecError` when the remote system sends bytes that are
   * not an MLLP frame, and with the socket's own error when it failed.
   */
  read(): Promise<Uint8Array | null>;
  /**
   * Stops reading and writing, then ends the socket underneath. A read still
   * waiting rejects.
   *
   * Never rejects. Idempotent. Bounded.
   */
  close(): Promise<void>;
}

export interface OpenOptions {
  /** Time the remote system has to accept the connection. */
  readonly timeoutMs: number;
  /** Maximum bytes buffered while reading one frame. */
  readonly maxBufferedBytes: number;
  /** Cancels the attempt. Its reason is what a cancelled open throws. */
  readonly signal: AbortSignal;
}

/**
 * Opens `socket` and takes ownership of its streams.
 *
 * A failed open leaves the socket closed, by the socket's own contract, so a
 * caller that catches has nothing to clean up.
 *
 * @throws `signal.reason` when the caller cancelled.
 * @throws {MllpConnectTimeoutError} No socket within `timeoutMs`.
 * @throws {MllpConnectFailedError} The socket failed to open.
 */
export async function connect(
  socket: MllpSocket,
  opts: OpenOptions
): Promise<MllpConnection> {
  const { maxBufferedBytes, signal, timeoutMs } = opts;
  const deadline = AbortSignal.timeout(timeoutMs);

  let streams: MllpStreams;
  try {
    streams = await socket.connect(AbortSignal.any([signal, deadline]));
  } catch (error) {
    // Ordered by precedence: the caller's own reason first, then the deadline
    // it set, then the failure the socket reported.
    if (signal.aborted) {
      throw signal.reason;
    }
    if (deadline.aborted) {
      throw new MllpConnectTimeoutError(timeoutMs);
    }
    throw new MllpConnectFailedError(error);
  }

  const reader = streams.readable
    .pipeThrough(unframe({ maxBufferedBytes }))
    .getReader();
  const writer = streams.writable.getWriter();

  return {
    async close() {
      // Release the streams, do not cancel them: cancelling would destroy the
      // socket under the adapter and skip its graceful close. A read parked on
      // the released reader rejects, which is how the client learns the
      // connection is gone.
      reader.releaseLock();
      writer.releaseLock();
      await socket.close();
    },
    async read() {
      const next = await reader.read();
      return next.done ? null : next.value;
    },
    write: (framed) => writer.write(framed),
  };
}
