/**
 * Errors raised by `@glion/mllp-client`.
 *
 * One class per situation, all extending {@link MllpClientError}. The class
 * is the discriminant: catch the base to handle anything the client throws,
 * or `instanceof` one class to react to one situation. Each class also carries
 * a fixed `code` (the same word as the class name) for logs, metrics, and
 * `switch` statements, and `delivery`, which says whether the message may
 * have reached the remote system.
 *
 * ```text
 * MllpClientError                 code, delivery
 * ├── MllpInvalidOptionError      an option is out of range              not-sent
 * ├── MllpAlreadySendingError     send() while a send is in flight       not-sent
 * ├── MllpClientClosedError       the client is closed for good          not-sent
 * ├── MllpInvalidMessageError     the message cannot be sent as-is       not-sent
 * ├── MllpConnectFailedError      the connection could not be opened     not-sent
 * ├── MllpConnectTimeoutError     the connection did not open in time    not-sent
 * ├── MllpConnectAbortedError     close() arrived while connecting       not-sent
 * ├── MllpSendTimeoutError        no acknowledgment arrived in time      unknown
 * ├── MllpDroppedError            the connection was lost mid-send       unknown
 * └── MllpInvalidResponseError    the reply is not a usable ack          unknown
 * ```
 *
 * Errors from the layers below arrive on `cause`, never as the thrown type:
 * the connector's network error under `MllpConnectFailedError`, the codec's
 * or parser's error under `MllpInvalidMessageError` and
 * `MllpInvalidResponseError`, the stream error under `MllpDroppedError`.
 *
 * A NAK is deliberately not an `MllpClientError`. When the remote system
 * understood the message and rejected it, `send()` throws the matching
 * `@glion/ack` `AckException`, the same type the server raises, so a caller
 * can tell "the remote system said no" from "the client or the wire failed".
 *
 * @module
 */

export const MllpErrorCode = {
  ALREADY_SENDING: "ALREADY_SENDING",
  CLOSED: "CLOSED",
  CONNECT_ABORTED: "CONNECT_ABORTED",
  CONNECT_FAILED: "CONNECT_FAILED",
  CONNECT_TIMEOUT: "CONNECT_TIMEOUT",
  DROPPED: "DROPPED",
  INVALID_MESSAGE: "INVALID_MESSAGE",
  INVALID_OPTION: "INVALID_OPTION",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  SEND_TIMEOUT: "SEND_TIMEOUT",
} as const;

export type MllpErrorCode = (typeof MllpErrorCode)[keyof typeof MllpErrorCode];

/**
 * Whether a message may have reached the remote system.
 *
 * - `not-sent`: nothing reached the wire. Sending again is safe.
 * - `unknown`: the message may have been received. Send again only when the
 *   message is safe to repeat.
 */
export type MllpDelivery = "not-sent" | "unknown";

const DELIVERY: Record<MllpErrorCode, MllpDelivery> = {
  ALREADY_SENDING: "not-sent",
  CLOSED: "not-sent",
  CONNECT_ABORTED: "not-sent",
  CONNECT_FAILED: "not-sent",
  CONNECT_TIMEOUT: "not-sent",
  DROPPED: "unknown",
  INVALID_MESSAGE: "not-sent",
  INVALID_OPTION: "not-sent",
  INVALID_RESPONSE: "unknown",
  SEND_TIMEOUT: "unknown",
};

export abstract class MllpClientError extends Error {
  abstract readonly code: MllpErrorCode;

  /** Whether the message may have reached the remote system. */
  get delivery(): MllpDelivery {
    return DELIVERY[this.code];
  }
}

/** An option is out of range. Raised before anything happens. */
export class MllpInvalidOptionError extends MllpClientError {
  override readonly name = "MllpInvalidOptionError";
  readonly code = MllpErrorCode.INVALID_OPTION;
  readonly option: string;

  constructor(option: string, requirement: string, received: unknown) {
    super(
      `Option ${option} must be ${requirement}; received ${String(received)}.`
    );
    this.option = option;
  }
}

/**
 * `send()` was called while another message was still waiting for its
 * acknowledgment. The client sends one message at a time.
 */
export class MllpAlreadySendingError extends MllpClientError {
  override readonly name = "MllpAlreadySendingError";
  readonly code = MllpErrorCode.ALREADY_SENDING;
  /** MSH-10 of the message that is still waiting. */
  readonly controlId: string;

  constructor(controlId: string) {
    super(
      `Cannot send: message ${controlId} is still waiting for its acknowledgment — await the in-flight send() first.`
    );
    this.controlId = controlId;
  }
}

/**
 * The client is closed for good, by `close()` or by a failure that ended the
 * connection. A closed client never reconnects; construct a new one. When a
 * failure closed the client, that error is on `cause`.
 */
export class MllpClientClosedError extends MllpClientError {
  override readonly name = "MllpClientClosedError";
  readonly code = MllpErrorCode.CLOSED;

  constructor(cause?: MllpClientError) {
    super(
      cause
        ? `The client is closed because its connection was lost (the reason is on cause) — construct a new MllpClient to send again.`
        : `The client has been closed — construct a new MllpClient to send again.`,
      { cause }
    );
  }
}

/**
 * The message cannot be sent as-is: it has no MSH-10 control ID, or it could
 * not be parsed, serialized, or framed. Nothing was written; the reason is on
 * `cause`. Fix the message and send again.
 */
export class MllpInvalidMessageError extends MllpClientError {
  override readonly name = "MllpInvalidMessageError";
  readonly code = MllpErrorCode.INVALID_MESSAGE;

  constructor(cause: unknown) {
    super(
      `The message could not be prepared for sending; nothing was written — the reason is on cause.`,
      { cause }
    );
  }
}

/**
 * The connection could not be opened: the host was unreachable, refused the
 * connection, or failed DNS or TLS. The connector's error is on `cause`.
 */
export class MllpConnectFailedError extends MllpClientError {
  override readonly name = "MllpConnectFailedError";
  readonly code = MllpErrorCode.CONNECT_FAILED;

  constructor(cause: unknown) {
    super(
      `Connecting failed — check that the host is reachable and the port is listening. The reason is on cause.`,
      { cause }
    );
  }
}

/**
 * The remote system did not accept the connection within `connectTimeoutMs`.
 * The host may be down, overloaded, or silently dropping packets.
 */
export class MllpConnectTimeoutError extends MllpClientError {
  override readonly name = "MllpConnectTimeoutError";
  readonly code = MllpErrorCode.CONNECT_TIMEOUT;
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(
      `Connecting timed out after ${timeoutMs}ms — check that the host is reachable and the port is listening.`
    );
    this.timeoutMs = timeoutMs;
  }
}

/** `close()` arrived while the connection was still being established. */
export class MllpConnectAbortedError extends MllpClientError {
  override readonly name = "MllpConnectAbortedError";
  readonly code = MllpErrorCode.CONNECT_ABORTED;

  constructor() {
    super(
      `Connecting was cancelled because the client was closed while the connection was still being established.`
    );
  }
}

/**
 * No acknowledgment arrived within the send timeout. The client closes the
 * connection, because a late acknowledgment could never be matched safely.
 * Whether the remote system received the message is unknown.
 */
export class MllpSendTimeoutError extends MllpClientError {
  override readonly name = "MllpSendTimeoutError";
  readonly code = MllpErrorCode.SEND_TIMEOUT;
  /** MSH-10 of the message that was waiting. */
  readonly controlId: string;
  readonly timeoutMs: number;

  constructor(controlId: string, timeoutMs: number) {
    super(
      `Message ${controlId} was not acknowledged within ${timeoutMs}ms — the connection has been closed, because a late acknowledgment could not be matched safely. Construct a new MllpClient to send again.`
    );
    this.controlId = controlId;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * The connection was lost while a message was waiting for its
 * acknowledgment: the remote system hung up, or the network broke. Whether
 * the remote system received the message is unknown. A stream error, when
 * there was one, is on `cause`.
 */
export class MllpDroppedError extends MllpClientError {
  override readonly name = "MllpDroppedError";
  readonly code = MllpErrorCode.DROPPED;
  /** MSH-10 of the message that was waiting. */
  readonly controlId: string;

  constructor(controlId: string, cause?: unknown) {
    super(
      `The connection was lost while message ${controlId} was waiting for its acknowledgment — the remote system may or may not have received it; resend only if the message is safe to repeat. ${cause === undefined ? "The remote system closed the connection." : "The reason is on cause."}`,
      { cause }
    );
    this.controlId = controlId;
  }
}

/**
 * The reply was not a usable acknowledgment of the message that was waiting:
 * it could not be decoded, its acknowledgment code was missing or unknown, or
 * it answered a different message. The client closes the connection, because
 * acknowledgments on it can no longer be matched safely. The reason is on
 * `cause`.
 */
export class MllpInvalidResponseError extends MllpClientError {
  override readonly name = "MllpInvalidResponseError";
  readonly code = MllpErrorCode.INVALID_RESPONSE;
  /** MSH-10 of the message that was waiting. */
  readonly controlId: string;

  constructor(controlId: string, cause: unknown) {
    super(
      `The acknowledgment for message ${controlId} cannot be used, so the connection has been closed — the reason is on cause. Construct a new MllpClient to send again.`,
      { cause }
    );
    this.controlId = controlId;
  }
}
