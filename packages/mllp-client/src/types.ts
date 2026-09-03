/**
 * The public types of `@glion/mllp-client`. Types only — no runtime values.
 *
 * @module
 */

import type { AckSuccessCode } from "@glion/ack";
import type { Root } from "@glion/ast";

// ── For application authors ──────────────────────────────────────────

/** The client's connection phase. */
export type MllpClientState =
  | "closed"
  | "connected"
  | "connecting"
  | "idle"
  | "sending";

export interface MllpSendOptions {
  /** Overrides the default send deadline (ms): write + ACK wait. */
  readonly timeoutMs?: number;
}

export interface MllpClientOptions {
  readonly host: string;
  readonly port: number;
  /** Runtime adapter; e.g. `connectNode` from `@glion/mllp-client/node`. */
  readonly connect: MllpConnector;
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

/**
 * What `MllpClient.send()` accepts — a `string` (serialized HL7v2 text) or a
 * `Root` (a parsed tree). Both are normalized to a tree and re-serialized to
 * canonical HL7v2 for the wire. A `string` is parsed; a `Root` is used as-is.
 *
 * Cleaning is syntactic only — semantics are preserved. Line endings normalize
 * to CR and trailing empty fields / segments are trimmed; escape sequences,
 * Z-segments, repetitions, and components round-trip verbatim. Two caveats:
 * trailing-empty trimming is not idempotent (it drops one trailing empty field
 * per pass), and a `Root` that was escape-_decoded_ upstream (e.g. via
 * `hl7v2DecodeEscapes`) must not be sent — `toHl7v2` has no re-encode step and
 * would emit the decoded literal.
 *
 * Raw bytes are not accepted — decode them to text at your I/O boundary (where
 * charset / MSH-18 knowledge lives) and pass the `string`.
 */
export type SendInput = string | Root;

/**
 * The acknowledgment that accepted a sent message. A NAK rejects `send()`
 * instead.
 */
export interface MllpClientResponse {
  /** MSA-1: `AA` or `CA`. */
  readonly code: AckSuccessCode;
  /** The acknowledgment, parsed. */
  readonly tree: Root;
  /** The acknowledgment as received, decoded to text. */
  readonly raw: string;
}

// ── For adapter authors ──────────────────────────────────────────────
//
// A connection carries bytes and nothing else — it knows nothing about HL7v2
// or MLLP framing. The contract is documented, not defended: the client
// trusts every clause, and each adapter proves them at its own layer with
// the shared conformance suite.

/**
 * One open connection, as a pair of byte streams and a way to end it.
 *
 * Adapters must honour three clauses:
 *
 * 1. `close()` is idempotent, never rejects, and resolves within a bounded time
 *    even if the remote system never responds — end the connection gracefully
 *    first, then force it.
 * 2. When the connection ends for any reason, `readable` reports end-of-stream or
 *    an error to a pending read. Bytes the remote system wrote before closing
 *    gracefully arrive before end-of-stream.
 * 3. The streams belong to the client for the connection's lifetime; the client
 *    releases them before calling `close()`.
 */
export interface MllpConnection {
  /** Bytes from the remote system. */
  readonly readable: ReadableStream<Uint8Array>;
  /** Bytes to the remote system. */
  readonly writable: WritableStream<Uint8Array>;
  /** Ends the connection. Idempotent; never rejects; bounded in time. */
  close(): Promise<void>;
}

/**
 * Opens one connection to a host and port.
 *
 * The connector must honour the `signal`: when it aborts before the
 * connection opens, reject and leave nothing live. A connection that opens in
 * the instant after the abort is the client's to close.
 */
export type MllpConnector = (opts: {
  readonly host: string;
  readonly port: number;
  readonly signal: AbortSignal;
}) => Promise<MllpConnection>;
