/**
 * Reconnect/backoff policy — pure configuration plus the capped-exponential
 * backoff delay (with jitter). No state, no I/O. The connection machine
 * (`../state.ts`) carries a {@link ReconnectPolicy} and calls
 * {@link backoffDelay} when scheduling a redial.
 *
 * @module
 */

/**
 * How the reconnect delay is randomised. `"full"` applies AWS-style full jitter
 * — a uniform pick in `[0, computed]` — to avoid reconnect stampedes when many
 * clients drop at once. `"none"` uses the exact computed delay (deterministic;
 * useful in tests).
 */
export type JitterStrategy = "full" | "none";

/** Reconnect/backoff policy. All times in milliseconds. */
export interface ReconnectPolicy {
  /** Max reconnect attempts after a drop before going to `closed`. */
  readonly maxReconnectAttempts: number;
  /**
   * First reconnect delay; doubles each attempt up to
   * {@link ReconnectPolicy.maxDelayMs}.
   */
  readonly baseDelayMs: number;
  /** Ceiling on the exponential delay. */
  readonly maxDelayMs: number;
  /** Delay randomisation. */
  readonly jitter: JitterStrategy;
}

/**
 * Reconnect disabled: a drop goes straight to `closed`. The client's current
 * default, so integrating the machine preserves today's behaviour.
 */
export const NO_RECONNECT: ReconnectPolicy = {
  baseDelayMs: 250,
  jitter: "full",
  maxDelayMs: 30_000,
  maxReconnectAttempts: 0,
};

/**
 * Sensible reconnect defaults once enabled: 5 attempts, 250 ms → 30 s, full
 * jitter.
 */
export const DEFAULT_RECONNECT_POLICY: ReconnectPolicy = {
  baseDelayMs: 250,
  jitter: "full",
  maxDelayMs: 30_000,
  maxReconnectAttempts: 5,
};

/**
 * Capped exponential backoff for the nth reconnect attempt (1-based):
 * `min(maxDelayMs, baseDelayMs · 2^(attempt-1))`, with full jitter applied when
 * the policy asks for it. Call once per attempt so the jitter is fresh.
 */
export function backoffDelay(policy: ReconnectPolicy, attempt: number): number {
  const exponential = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs * 2 ** (attempt - 1)
  );
  return policy.jitter === "full" ? Math.random() * exponential : exponential;
}
