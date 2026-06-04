/**
 * The single error type for `@glion/mllp-client`.
 *
 * Every failure the client itself raises is an {@link MllpClientError}
 * carrying a {@link MllpErrorCode}. **Branch on `code`** — it is the stable,
 * exhaustive discriminant; a `switch` on it never needs to inspect client
 * state. The human-readable detail is in `message`; a wrapped underlying
 * failure is on the standard `cause`.
 *
 * A NAK is deliberately *not* an `MllpClientError`: `send()` throws an
 * `@glion/ack` `AckException` when the peer understood the message and
 * rejected it. The two are separate buckets — "the wire/protocol failed or
 * the call was misused" (`MllpClientError`) vs. "the peer said no"
 * (`AckException`) — so a caller catches them separately.
 *
 * @module
 */

export const MllpErrorCode = {
  /**
   * Connecting was attempted on a client that is already connecting or
   * connected. A client holds one connection for its lifetime — it should be
   * reused for every message, with a second client opened only when a parallel
   * connection is genuinely needed.
   */
  ALREADY_CONNECTED: "ALREADY_CONNECTED",
  /**
   * The client has already been closed. A closed client is done for good and
   * will not reconnect — a new one must be created to reach the peer again.
   */
  CLOSED: "CLOSED",
  /**
   * The client was closed while it was still connecting, so the connection
   * never finished opening. Expected when closing mid-connect; otherwise it
   * means something shut the client down before it was ready.
   */
  CONNECT_ABORTED: "CONNECT_ABORTED",
  /**
   * The connection could not be opened — the host was unreachable, refused the
   * connection, failed DNS, or rejected the TLS handshake. The address and
   * whether the peer is listening are worth checking; the underlying network
   * error is on `cause`.
   */
  CONNECT_FAILED: "CONNECT_FAILED",
  /**
   * The peer did not accept the connection in time. The host may be slow,
   * overloaded, or silently dropping connections; retrying may help, as may
   * raising `connectTimeoutMs` when the peer is simply slow to accept.
   */
  CONNECT_TIMEOUT: "CONNECT_TIMEOUT",
  /**
   * The connection was lost and can no longer be used — the peer hung up, the
   * network broke mid-send, or the peer sent malformed or unexpected data. The
   * in-flight message did not complete; a new connection must be opened, and
   * the message resent only when it is safe to repeat. The specifics are in
   * `message`, with any underlying error on `cause`.
   */
  DROPPED: "DROPPED",
  /**
   * The peer replied, but the reply was not a usable acknowledgment of the
   * sent message: it was garbled (not UTF-8), missing or carrying an
   * unrecognized acknowledgment code, or it answered a different message (a
   * late reply to an earlier send that had already timed out). Whether the
   * peer accepted the message is unknowable — its fate should be treated as
   * unknown. The specifics are in `message`, with any decoding error on
   * `cause`.
   */
  INVALID_RESPONSE: "INVALID_RESPONSE",
  /**
   * Sending was attempted before the client was connected. The client must
   * connect, and the connection must succeed, before a message can be sent.
   */
  NOT_CONNECTED: "NOT_CONNECTED",
  /**
   * A send was started while another was still waiting for its acknowledgment.
   * The client handles one message at a time — the in-flight send must resolve
   * before the next one starts.
   */
  SEND_IN_PROGRESS: "SEND_IN_PROGRESS",
  /**
   * The peer did not acknowledge the message in time. The connection stays
   * open and remains usable for further sends, but whether the peer received
   * this message is unknown — it should be resent only when it is safe to
   * repeat. The timeout is configurable per send via `opts.timeoutMs`, or for
   * the whole client via `sendTimeoutMs`.
   */
  SEND_TIMEOUT: "SEND_TIMEOUT",
} as const;

export type MllpErrorCode = (typeof MllpErrorCode)[keyof typeof MllpErrorCode];

/**
 * The one error class `@glion/mllp-client` raises. Discriminate with `code`;
 * read `message` for the detail and `cause` for any wrapped underlying error.
 */
export class MllpClientError extends Error {
  readonly code: MllpErrorCode;

  constructor(
    code: MllpErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "MllpClientError";
    this.code = code;
  }

  static timeout(timeoutMs: number): MllpClientError {
    return new MllpClientError(
      MllpErrorCode.SEND_TIMEOUT,
      `The request timed out after ${timeoutMs}ms.`
    );
  }

  static connectionFailure(cause: unknown): MllpClientError {
    return new MllpClientError(
      MllpErrorCode.CONNECT_FAILED,
      "The connection could not be opened. See the error's cause for details.",
      { cause }
    );
  }

  static connectionAborted(): MllpClientError {
    return new MllpClientError(
      MllpErrorCode.CONNECT_ABORTED,
      "Connect was interrupted while the connection was still being established."
    );
  }

  static connectionTimeout(timeoutMs: number): MllpClientError {
    return new MllpClientError(
      MllpErrorCode.CONNECT_TIMEOUT,
      `Connect timed out after ${timeoutMs}ms.`
    );
  }
}
