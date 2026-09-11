/**
 * The public types of `@glion/mllp-client`. Types only — no runtime values.
 *
 * @module
 */

import type { AckSuccessCode } from "@glion/ack";
import type { Root } from "@glion/ast";

// ── For adapter authors ──────────────────────────────────────────────

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

/** The client's phase. */
export type MllpClientState =
  | "closed"
  | "closing"
  | "connected"
  | "connecting"
  | "idle"
  | "sending";

export interface MllpReconnectOptions {
  /**
   * Attempts after a failed one before the client closes. `Infinity` for no
   * limit.
   *
   * @default 5
   */
  readonly attempts?: number;
  /**
   * Time to wait before `attempt` in milliseconds.
   *
   * @default full-jitter exponential backoff from 1 s, capped at 30 s
   */
  readonly delay?: (attempt: number) => number;
}

export interface MllpSendOptions {
  /** Overrides the default send deadline: write plus acknowledgment wait. */
  readonly timeoutMs?: number;
}

export interface MllpClientOptions {
  /** Runtime adapter; e.g. `nodeSocket` from `@glion/mllp-client/node`. */
  readonly socket: MllpSocket;
  /**
   * Time to wait for the connection to open, in milliseconds.
   *
   * @default 10_000
   */
  readonly connectTimeoutMs?: number;
  /**
   * Time to wait for an acknowledgment after sending, in milliseconds.
   *
   * @default 30_000
   */
  readonly sendTimeoutMs?: number;
  /**
   * Maximum bytes buffered while receiving one message. A remote system that
   * never finishes one is dropped once it exceeds this.
   *
   * @default 16 MiB
   */
  readonly maxBufferedBytes?: number;
  /**
   * How the client dials again after a connection attempt fails or an open
   * connection is lost. `false`: it closes instead.
   *
   * @default 5 attempts with full-jitter backoff, about 30 seconds in all
   */
  readonly reconnect?: MllpReconnectOptions | false;
}

/**
 * An acknowledgment that accepted the message: MSA-1 is `AA` or `CA`.
 *
 * A NAK never reaches here — `send()` throws the matching `@glion/ack`
 * exception instead.
 */
export interface MllpClientResponse {
  /**
   * MSH-10 of the acknowledgment itself, for tracing. MUST NOT be used for
   * correlation; see `controlId`.
   */
  readonly id: string;
  /**
   * MSA-2: the MSH-10 of the message this one answers. HL7v2 names both
   * fields Message Control ID. The only field correlation may use.
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
