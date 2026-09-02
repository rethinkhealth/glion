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
 * `@glion/ack` `AckException` when the remote system understood the message and
 * rejected it. The two are separate buckets — "the wire/protocol failed or
 * the call was misused" (`MllpClientError`) vs. "the remote system said no"
 * (`AckException`) — so a caller catches them separately.
 *
 * @module
 */

export const MllpErrorCode = {
  /**
   * A send was started while another was still waiting for its acknowledgment.
   * The client handles one message at a time — the in-flight send must resolve
   * before the next one starts.
   */
  ALREADY_SENDING: "ALREADY_SENDING",
  /**
   * The client has already been closed. A closed client is done for good and
   * will not reconnect — a new one must be created to reach the remote system
   * again.
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
   * whether the remote system is listening are worth checking; the underlying
   * network error is on `cause`.
   */
  CONNECT_FAILED: "CONNECT_FAILED",
  /**
   * The remote system did not accept the connection in time. The host may be
   * slow, overloaded, or silently dropping connections; retrying may help, as
   * may raising `connectTimeoutMs` when the remote system is simply slow to
   * accept.
   */
  CONNECT_TIMEOUT: "CONNECT_TIMEOUT",
  /**
   * The connection was lost and can no longer be used — the remote system hung
   * up, the network broke mid-send, or the remote system sent malformed or
   * unexpected data. The in-flight message did not complete; a new connection
   * must be opened, and the message resent only when it is safe to repeat. The
   * specifics are in `message`, with any underlying error on `cause`.
   */
  DROPPED: "DROPPED",
  /**
   * The message cannot be sent as-is: it has no MSH-10 control ID (HL7v2
   * requires one — without it the acknowledgment cannot be correlated), or
   * its serialized text contains an MLLP reserved character (VT or FS; the
   * `MllpCodecError` is on `cause`). Nothing was written to the wire; fix
   * the message and send again.
   */
  INVALID_MESSAGE: "INVALID_MESSAGE",
  /**
   * The remote system replied, but the reply was not a usable acknowledgment of
   * the sent message: it was garbled (not UTF-8), missing or carrying an
   * unrecognized acknowledgment code, or it answered a different message (an
   * unsolicited or duplicate frame consumed as this send's acknowledgment).
   * The client closes the connection: an uninterpretable reply means
   * acknowledgment correlation on this wire can no longer be trusted — resend
   * on a new client, and only when it is safe to repeat. Whether the
   * remote system accepted the message is unknowable — its fate should be
   * treated as unknown. The specifics are in `message`, with any decoding error
   * on `cause`.
   */
  INVALID_RESPONSE: "INVALID_RESPONSE",
  /**
   * Sending was attempted before the client was connected. The client must
   * connect, and the connection must succeed, before a message can be sent.
   */
  NOT_CONNECTED: "NOT_CONNECTED",
  /**
   * The remote system did not acknowledge the message in time. The client
   * closes the connection: after a timeout, a late acknowledgment could never
   * be matched safely, so the wire cannot be trusted for further sends.
   * Whether the remote system received the message is unknown — resend on a
   * new client, and only when it is safe to repeat. The timeout is
   * configurable per send via `opts.timeoutMs`, or for the whole client via
   * `sendTimeoutMs`, and covers the whole exchange: writing the message and
   * waiting for its acknowledgment.
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
      `The request timed out after ${timeoutMs}ms. The connection has been closed: a late acknowledgment could not be matched safely.`
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

  static missingControlId(): MllpClientError {
    return new MllpClientError(
      MllpErrorCode.INVALID_MESSAGE,
      "The message has no MSH-10 control ID, so its acknowledgment cannot be correlated. Set MSH-10 and send again."
    );
  }

  static reservedCharacter(cause: unknown): MllpClientError {
    return new MllpClientError(
      MllpErrorCode.INVALID_MESSAGE,
      "The message contains an MLLP reserved character (VT or FS), so it cannot be framed. Remove the reserved bytes and send again (the codec error is on the error's cause).",
      { cause }
    );
  }

  static connectionTimeout(timeoutMs: number): MllpClientError {
    return new MllpClientError(
      MllpErrorCode.CONNECT_TIMEOUT,
      `Connect timed out after ${timeoutMs}ms.`
    );
  }

  static closed(closedReason: MllpClientError | null = null): MllpClientError {
    if (closedReason) {
      return new MllpClientError(
        MllpErrorCode.CLOSED,
        "This client is closed: the connection was lost or never opened (see the error's cause). Construct a new MllpClient to talk to the remote system again.",
        { cause: closedReason }
      );
    }
    return new MllpClientError(
      MllpErrorCode.CLOSED,
      "This client has been closed. Construct a new MllpClient to talk to the remote system again."
    );
  }

  static notConnected(): MllpClientError {
    return new MllpClientError(
      MllpErrorCode.NOT_CONNECTED,
      "Cannot send: the client is not connected. Call connect() and await it before send()."
    );
  }

  static alreadySending(): MllpClientError {
    return new MllpClientError(
      MllpErrorCode.ALREADY_SENDING,
      "Cannot send: another send is already on the wire. This client is single-flight; await the in-flight send first."
    );
  }
}
