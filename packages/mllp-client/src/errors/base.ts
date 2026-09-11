/**
 * The base every client error extends, and the two values each one carries.
 *
 * @module
 */

export const MllpErrorCode = {
  ALREADY_SENDING: "ALREADY_SENDING",
  CLOSED: "CLOSED",
  CONNECTION_LOST: "CONNECTION_LOST",
  CONNECT_FAILED: "CONNECT_FAILED",
  CONNECT_TIMEOUT: "CONNECT_TIMEOUT",
  INVALID_MESSAGE: "INVALID_MESSAGE",
  INVALID_OPTION: "INVALID_OPTION",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  SEND_TIMEOUT: "SEND_TIMEOUT",
} as const;

export type MllpErrorCode = (typeof MllpErrorCode)[keyof typeof MllpErrorCode];

export abstract class MllpClientError extends Error {
  abstract readonly code: MllpErrorCode;
}

/** The text of a lower layer's error, for the message that wraps it. */
export function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
