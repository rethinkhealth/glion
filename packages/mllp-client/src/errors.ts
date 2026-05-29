/**
 * Error codes and typed error classes for `@glion/mllp-client`.
 *
 * Every error extends {@link MllpClientError} and carries a `code` from
 * {@link MllpErrorCode}; a caller's `switch` on the code never needs to
 * inspect client state.
 *
 * @module
 */

import type { Root } from "@glion/ast";

export const MllpErrorCode = {
  ALREADY_CONNECTED: "ALREADY_CONNECTED",
  CLOSED: "CLOSED",
  CONCURRENT_SEND: "CONCURRENT_SEND",
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

export class MllpClientError<
  TCode extends string = MllpErrorCode,
> extends Error {
  readonly code: TCode;
  constructor(code: TCode, message: string, opts?: { cause?: unknown }) {
    super(message, opts);
    this.name = "MllpClientError";
    this.code = code;
  }
}

export class MllpConnectError extends MllpClientError {
  readonly host: string;
  readonly port: number;
  constructor(opts: { host: string; port: number; cause?: unknown }) {
    super(
      MllpErrorCode.CONNECT_FAILED,
      `Failed to connect to ${opts.host}:${opts.port}`,
      {
        cause: opts.cause,
      }
    );
    this.name = "MllpConnectError";
    this.host = opts.host;
    this.port = opts.port;
  }
}

export class MllpTimeoutError extends MllpClientError {
  readonly phase: "connect" | "send";
  readonly timeoutMs: number;
  constructor(phase: "connect" | "send", timeoutMs: number) {
    super(
      phase === "connect"
        ? MllpErrorCode.CONNECT_TIMEOUT
        : MllpErrorCode.SEND_TIMEOUT,
      `${phase === "connect" ? "Connect" : "Send"} timed out after ${timeoutMs}ms`
    );
    this.name = "MllpTimeoutError";
    this.phase = phase;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Why a connection ended. Lets the caller branch on cause without
 * parsing the message string.
 */
export type MllpDropReason =
  | "peer-drop"
  | "framing-error"
  | "frame-queue-overflow"
  | "write-failed";

/**
 * The peer or the transport ended the connection while a send was
 * waiting for an ACK (peer FIN, RST, transport error, decoder error,
 * write failure). Distinct from `MllpClientError(CLOSED)`, which is
 * thrown when the caller has already closed the client.
 */
export class MllpDroppedError extends MllpClientError {
  readonly reason: MllpDropReason;
  constructor(
    reason: MllpDropReason,
    message = defaultDropMessage(reason),
    opts?: { cause?: unknown }
  ) {
    super(MllpErrorCode.DROPPED, message, opts);
    this.name = "MllpDroppedError";
    this.reason = reason;
  }
}

function defaultDropMessage(reason: MllpDropReason): string {
  switch (reason) {
    case "peer-drop": {
      return "Peer closed the connection";
    }
    case "framing-error": {
      return "Decoder rejected peer bytes; connection unrecoverable";
    }
    case "frame-queue-overflow": {
      return "Peer flooded the client with unsolicited frames";
    }
    case "write-failed": {
      return "Write to socket failed; connection unrecoverable";
    }
    default: {
      return "Connection dropped";
    }
  }
}

export class MllpCorrelationError extends MllpClientError {
  readonly expected: string;
  readonly actual: string;
  readonly tree: Root;
  readonly raw: Uint8Array;
  constructor(opts: {
    expected: string;
    actual: string;
    tree: Root;
    raw: Uint8Array;
  }) {
    super(
      MllpErrorCode.CORRELATION_MISMATCH,
      `Response controlId mismatch: expected "${opts.expected}", got "${opts.actual}"`
    );
    this.name = "MllpCorrelationError";
    this.expected = opts.expected;
    this.actual = opts.actual;
    this.tree = opts.tree;
    this.raw = opts.raw;
  }
}
