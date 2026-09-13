/**
 * The reconnect policy, its default delay, and the wait between attempts.
 *
 * @module
 */

/** A reconnect policy with every option resolved. */
export interface ReconnectPolicy {
  readonly attempts: number;
  readonly delay: (attempt: number) => number;
}

/** Ceiling of the first default wait, in milliseconds. Doubles per attempt. */
const BACKOFF_BASE_MS = 1000;

/** Ceiling of every default wait, in milliseconds. */
const BACKOFF_CAP_MS = 30_000;

/**
 * Full-jitter exponential backoff: a wait drawn uniformly from zero to
 * `min(30 s, 1 s × 2^(attempt − 1))`.
 */
export function defaultReconnectDelay(attempt: number): number {
  const ceiling = Math.min(
    BACKOFF_CAP_MS,
    BACKOFF_BASE_MS * 2 ** (attempt - 1)
  );
  return Math.floor(Math.random() * ceiling);
}

/** Resolves after `ms`, or at once when `signal` aborts first. Never rejects. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  // oxlint-disable-next-line promise/avoid-new -- wrapping a timer
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      // oxlint-disable-next-line promise/no-multiple-resolved -- each path unhooks the other first
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}
