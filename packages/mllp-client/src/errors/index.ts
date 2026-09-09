/**
 * Errors raised by `@glion/mllp-client`. One file per error, each named for
 * the class it exports.
 *
 * One class per situation, all extending {@link MllpClientError}. The class is
 * the discriminant: catch the base to handle anything the client throws, or
 * `instanceof` one class to react to one situation. Each class carries a fixed
 * `code` (the same word as the class name) for logs, metrics, and `switch`
 * statements, and `delivery`, which says whether the message may have reached
 * the remote system.
 *
 * ```text
 * MllpClientError               mllp-client-error.ts             code, delivery
 * ├── MllpInvalidOptionError    mllp-invalid-option-error.ts     an option is out of range            not-sent
 * ├── MllpAlreadySendingError   mllp-already-sending-error.ts    send() while a send is in flight     not-sent
 * ├── MllpClientClosedError     mllp-client-closed-error.ts      the client is closed for good        not-sent
 * ├── MllpInvalidMessageError   mllp-invalid-message-error.ts    the message cannot be sent as-is     not-sent
 * ├── MllpConnectFailedError    mllp-connect-failed-error.ts     the connection could not be opened   not-sent
 * ├── MllpConnectTimeoutError   mllp-connect-timeout-error.ts    the connection did not open in time  not-sent
 * ├── MllpSendTimeoutError      mllp-send-timeout-error.ts       no acknowledgment arrived in time    unknown
 * ├── MllpDroppedError          mllp-dropped-error.ts            the connection was lost mid-send     unknown
 * └── MllpInvalidResponseError  mllp-invalid-response-error.ts   the reply is not a usable ack        unknown
 *
 * AckException                  nak-exception.ts                 the remote system refused the message
 * ```
 *
 * Errors from the layers below arrive on `cause`, never as the thrown type:
 * the socket's network error under `MllpConnectFailedError`, the codec's or
 * parser's error under `MllpInvalidMessageError` and
 * `MllpInvalidResponseError`, the stream error under `MllpDroppedError`.
 *
 * A NAK is not an `MllpClientError`. When the remote system understood the
 * message and rejected it, `send()` throws the matching `@glion/ack`
 * `AckException` — the same type the server raises.
 *
 * @module
 */

export { MllpAlreadySendingError } from "./mllp-already-sending-error";
export { MllpClientError, MllpErrorCode } from "./base";
export type { MllpDelivery } from "./base";
export { MllpClientClosedError } from "./mllp-client-closed-error";
export { MllpConnectFailedError } from "./mllp-connect-failed-error";
export { MllpConnectTimeoutError } from "./mllp-connect-timeout-error";
export { MllpDroppedError } from "./mllp-dropped-error";
export { MllpInvalidMessageError } from "./mllp-invalid-message-error";
export { MllpInvalidOptionError } from "./mllp-invalid-option-error";
export { MllpInvalidResponseError } from "./mllp-invalid-response-error";
export { nakException } from "./nak-exception";
export { MllpSendTimeoutError } from "./mllp-send-timeout-error";
