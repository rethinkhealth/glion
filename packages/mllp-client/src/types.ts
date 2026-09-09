/**
 * The public types of `@glion/mllp-client`. Types only — no runtime values.
 *
 * @module
 */

import type { Ack } from "./codec";

// ── For adapter authors ──────────────────────────────────────────────
//
// An adapter implements one runtime's transport and nothing else: open a
// socket, expose it as byte streams, and end it. MLLP framing and stream
// ownership are handled above, so an adapter never sees a frame.

/** The byte streams an open socket carries. */
export interface MllpStreams {
  /** Bytes from the remote system. */
  readonly readable: ReadableStream<Uint8Array>;
  /** Bytes to the remote system. */
  readonly writable: WritableStream<Uint8Array>;
}

/** A socket to one remote system. */
export interface MllpSocket {
  /**
   * Opens the socket and returns its byte streams.
   *
   * Rejects with `signal.reason` when cancelled, leaving nothing open. Called
   * again only after `close()`.
   */
  connect(signal: AbortSignal): Promise<MllpStreams>;
  /**
   * Ends the socket `connect()` opened, and resolves once it is down.
   *
   * Never rejects. Idempotent. Bounded, even when the remote system does not
   * answer. An attempt still in flight is cancelled through its signal.
   */
  close(): Promise<void>;
}

// ── For application authors ──────────────────────────────────────────

/** The client's connection phase. */
export type MllpClientState =
  | "closed"
  | "connected"
  | "connecting"
  | "idle"
  | "sending";

export interface MllpClientOptions {
  readonly host: string;
  readonly port: number;
  /** Runtime adapter; e.g. `connectNode` from `@glion/mllp-client/node`. */
  readonly socket: MllpSocket;
  /** Time to wait for the connection to open. Default 10 000 ms. */
  readonly connectTimeoutMs?: number;
  /** Time to wait for an acknowledgment after sending. Default 30 000 ms. */
  readonly sendTimeoutMs?: number;
  /**
   * Maximum bytes buffered while receiving one frame. A remote system that
   * never terminates a frame is dropped once it exceeds this. Default 16 MiB.
   */
  readonly maxBufferedBytes?: number;
}

export interface MllpClientResponse {
  /**
   * The acknowledgment received from the remote system.
   *
   * For Nack, the client throws an error corresponding to the acknowledgment
   * code.
   */
  ack: Ack;
}
