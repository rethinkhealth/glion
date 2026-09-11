/**
 * The bounds and defaults the client is configured by. Constants only.
 *
 * @module
 */

/** Default time to wait for a connection to open, in milliseconds. */
export const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;

/** Default time to wait for an acknowledgment after sending, in milliseconds. */
export const DEFAULT_SEND_TIMEOUT_MS = 30_000;

/** Default maximum bytes buffered while receiving one message (16 MiB). */
export const DEFAULT_MAX_BUFFERED_BYTES = 16 * 1024 * 1024;

/** Default number of reconnect attempts after a failed one. */
export const DEFAULT_RECONNECT_ATTEMPTS = 5;

/**
 * Maximum timeout `setTimeout` supports, in milliseconds (2^31 − 1). Larger
 * values, including `Infinity`, are rejected: the platform would clamp them
 * to about 1 ms.
 */
export const MAX_TIMEOUT_MS = 2 ** 31 - 1;
