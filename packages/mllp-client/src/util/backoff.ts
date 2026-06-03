/**
 * Retry options + the dial-retry backoff delay (with jitter). Pure: no state,
 * no I/O. The connection machine (`../state.ts`) carries {@link RetryOptions}
 * and calls {@link backoffDelay} when scheduling the next dial after a
 * failure.
 *
 * @module
 */

/**
 * How the backoff delay is randomised. `"full"` applies AWS-style full jitter —
 * a uniform pick in `[0, computed]` — to avoid retry stampedes when many
 * clients drop at once. `"none"` uses the exact computed delay (deterministic;
 * tests).
 */
export type JitterStrategy = "full" | "none";

/** How the client retries a failed dial (initial connect or a redial). */
export interface RetryOptions {
  /**
   * Max retries after a failed dial before giving up (→ `closed`). `0` disables
   * retry.
   */
  readonly maxRetries: number;
  /**
   * Backoff base. The FIRST retry is immediate (0 ms); the second waits
   * `baseDelayMs`, then it doubles each attempt up to
   * {@link RetryOptions.maxDelayMs}.
   */
  readonly baseDelayMs: number;
  /** Ceiling on the exponential delay. */
  readonly maxDelayMs: number;
  /** Delay randomisation. */
  readonly jitter: JitterStrategy;
}

/**
 * Retry disabled: a failed dial (or a drop) goes straight to `closed`. The
 * client's current default, so the machine preserves today's behaviour.
 */
export const NO_RETRY: RetryOptions = {
  baseDelayMs: 250,
  jitter: "full",
  maxDelayMs: 30_000,
  maxRetries: 0,
};

/**
 * Sensible retry defaults once enabled: 5 retries, immediate → 250 ms → 30 s,
 * full jitter.
 */
export const DEFAULT_RETRY: RetryOptions = {
  baseDelayMs: 250,
  jitter: "full",
  maxDelayMs: 30_000,
  maxRetries: 5,
};

/**
 * Backoff before the nth retry (1-based). The FIRST retry is immediate (`0`);
 * from the second on it is capped exponential — `min(maxDelayMs, baseDelayMs ·
 * 2^(attempt-2))` — with full jitter applied when the options ask for it. Call
 * once per attempt so the jitter is fresh.
 */
export function backoffDelay(options: RetryOptions, attempt: number): number {
  if (attempt <= 1) {
    return 0;
  }
  const exponential = Math.min(
    options.maxDelayMs,
    options.baseDelayMs * 2 ** (attempt - 2)
  );
  return options.jitter === "full" ? Math.random() * exponential : exponential;
}
