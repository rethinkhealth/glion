/**
 * The single error type for `@glion/mllp-client`.
 *
 * Every failure the client itself raises is an {@link MllpClientError}
 * carrying a {@link MllpErrorCode}. **Branch on `code`** — it is the stable,
 * exhaustive discriminant; a `switch` on it never needs to inspect client
 * state. Code-specific detail rides on optional fields (only the fields
 * relevant to a given `code` are populated); a wrapped underlying failure is
 * on `cause`.
 *
 * A NAK is deliberately *not* an `MllpClientError`: `send()` throws an
 * `@glion/ack` `AckException` when the peer understood the message and
 * rejected it. The two are separate buckets — "the wire/protocol failed or
 * the call was misused" (`MllpClientError`) vs. "the peer said no"
 * (`AckException`) — so a caller catches them separately.
 *
 * @module
 */

import type { Root } from "@glion/ast";

export const MllpErrorCode = {
  ALREADY_CONNECTED: "ALREADY_CONNECTED",
  CLOSED: "CLOSED",
  CONNECT_ABORTED: "CONNECT_ABORTED",
  CONNECT_FAILED: "CONNECT_FAILED",
  CONNECT_TIMEOUT: "CONNECT_TIMEOUT",
  CORRELATION_MISMATCH: "CORRELATION_MISMATCH",
  DROPPED: "DROPPED",
  NOT_CONNECTED: "NOT_CONNECTED",
  PARSE_FAILED: "PARSE_FAILED",
  SEND_ABORTED: "SEND_ABORTED",
  SEND_TIMEOUT: "SEND_TIMEOUT",
  UNKNOWN_ACK_CODE: "UNKNOWN_ACK_CODE",
} as const;
export type MllpErrorCode = (typeof MllpErrorCode)[keyof typeof MllpErrorCode];

/**
 * Why a connection ended — set on {@link MllpClientError.reason} when `code`
 * is `DROPPED`. Lets the caller branch on cause (e.g. a retry policy) without
 * parsing the message string.
 */
export type MllpDropReason =
  | "peer-drop"
  | "framing-error"
  | "frame-queue-overflow"
  | "write-failed";

/**
 * Optional, code-specific detail for an {@link MllpClientError}. Only the
 * fields relevant to a given `code` are set.
 */
export interface MllpClientErrorDetails {
  /**
   * Underlying error being wrapped (e.g. the socket error behind
   * `CONNECT_FAILED`).
   */
  cause?: unknown;
  /** `DROPPED`: why the wire ended. */
  reason?: MllpDropReason;
  /** `CONNECT_TIMEOUT` / `SEND_TIMEOUT`: the deadline that elapsed, in ms. */
  timeoutMs?: number;
  /** `CORRELATION_MISMATCH`: the request's MSH-10 (the expected MSA-2). */
  expected?: string;
  /** `CORRELATION_MISMATCH`: the response's actual MSA-2. */
  actual?: string;
  /** `CORRELATION_MISMATCH`: parsed AST of the offending ACK. */
  tree?: Root;
  /** `CORRELATION_MISMATCH`: de-framed bytes of the offending ACK. */
  raw?: Uint8Array;
}

/**
 * The one error class `@glion/mllp-client` raises. Discriminate with `code`;
 * read the optional detail fields only for the codes that populate them.
 */
export class MllpClientError extends Error {
  readonly code: MllpErrorCode;
  readonly reason: MllpDropReason | undefined;
  readonly timeoutMs: number | undefined;
  readonly expected: string | undefined;
  readonly actual: string | undefined;
  readonly tree: Root | undefined;
  readonly raw: Uint8Array | undefined;

  constructor(
    code: MllpErrorCode,
    message: string,
    details: MllpClientErrorDetails = {}
  ) {
    super(message, { cause: details.cause });
    this.name = "MllpClientError";
    this.code = code;
    this.reason = details.reason;
    this.timeoutMs = details.timeoutMs;
    this.expected = details.expected;
    this.actual = details.actual;
    this.tree = details.tree;
    this.raw = details.raw;
  }
}

/**
 * The error a send rejects with when its combined abort signal fires:
 * `SEND_TIMEOUT` if the deadline elapsed, `SEND_ABORTED` if the caller's
 * signal aborted. Shared by the while-queued path (in the queue/drain layer)
 * and the on-wire frame waiter (in the connection) so both report the same
 * cause. Internal — not part of the public surface.
 */
export function sendAbortError(
  deadlineSignal: AbortSignal,
  timeoutMs: number
): MllpClientError {
  if (deadlineSignal.aborted) {
    return new MllpClientError(
      MllpErrorCode.SEND_TIMEOUT,
      `Timed out after ${timeoutMs}ms waiting for the peer to acknowledge the message (the deadline spans the queue wait and the wire round-trip).`,
      { timeoutMs }
    );
  }
  return new MllpClientError(
    MllpErrorCode.SEND_ABORTED,
    "Send aborted by the caller's abort signal before the ACK was received."
  );
}
