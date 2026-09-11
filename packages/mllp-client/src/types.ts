/**
 * The public types of `@glion/mllp-client`. Types only — no runtime values.
 *
 * @module
 */

import type { AckSuccessCode } from "@glion/ack";
import type { Root } from "@glion/ast";

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
   * Rejects with `signal.reason` when cancelled. A rejection leaves nothing
   * open. Called again only after `close()`.
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
  | "closing"
  | "connected"
  | "connecting"
  | "idle"
  | "sending";

export interface MllpSendOptions {
  /** Overrides the default send deadline: write plus acknowledgment wait. */
  readonly timeoutMs?: number;
}

export interface MllpClientOptions {
  /** Runtime adapter; e.g. `nodeSocket` from `@glion/mllp-client/node`. */
  readonly socket: MllpSocket;
  /** Time to wait for the connection to open. Default 10 000 ms. */
  readonly connectTimeoutMs?: number;
  /** Time to wait for an acknowledgment after sending. Default 30 000 ms. */
  readonly sendTimeoutMs?: number;
  /**
   * Maximum bytes buffered while receiving one message. A remote system that
   * never finishes one is dropped once it exceeds this. Default 16 MiB.
   */
  readonly maxBufferedBytes?: number;
}

/**
 * An acknowledgment that accepted the message: MSA-1 is `AA` or `CA`.
 *
 * A NAK never reaches here — `send()` throws the matching `@glion/ack`
 * exception instead.
 */
export interface MllpClientResponse {
  /**
   * MSH-10 of the acknowledgment itself: the receiver's own identifier for
   * this reply, which it will have logged under. Useful for tracing a message
   * across both systems; never useful for correlation — see `controlId`.
   */
  readonly id: string;
  /**
   * MSA-2, which HL7v2 also calls the Message Control ID: the MSH-10 of the
   * message this one answers.
   *
   * The standard gives MSH-10 and MSA-2 the same field name, and that is not
   * an accident — MSA-2 *contains* the other message's MSH-10. Which is why
   * `id` and this are both control IDs and mean opposite things: `id` is who
   * this acknowledgment is, `controlId` is who it is about. MSA-2 is the only
   * back-reference HL7v2 provides, and so the only thing correlation can use.
   */
  readonly controlId: string;
  /** The acknowledgment, parsed. */
  readonly tree: Root;
  /** The acknowledgment as received, decoded to text. */
  readonly raw: string;
  /** MSA-3: the remote system's own diagnostic, when it gave one. */
  readonly text?: string;
  /** MSA-1: `AA` or `CA`. */
  readonly code: AckSuccessCode;
}
