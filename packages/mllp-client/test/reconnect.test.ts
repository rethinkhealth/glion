/**
 * Unit tests for the reconnect policy + backoff math (in `state.ts`).
 *
 * `backoffDelay` is pure, so these assert the arithmetic directly — the
 * exponential growth, the cap, and the jitter bounds — without the state
 * machine. (The machine's use of it across a reconnect loop is covered in
 * `state.test.ts`; here we pin the calculation itself.)
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  backoffDelay,
  DEFAULT_RECONNECT_POLICY,
  NO_RECONNECT,
} from "../src/state";
import type { ReconnectPolicy } from "../src/state";

/** A deterministic policy (no jitter) for asserting exact delays. */
function policy(overrides: Partial<ReconnectPolicy> = {}): ReconnectPolicy {
  return {
    baseDelayMs: 100,
    jitter: "none",
    maxDelayMs: 10_000,
    maxReconnectAttempts: 5,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("backoffDelay — exponential growth (jitter: none)", () => {
  it("doubles each attempt from baseDelayMs (1-based attempt)", () => {
    const p = policy({ baseDelayMs: 100, maxDelayMs: 10_000 });
    // attempt n → baseDelayMs * 2^(n-1)
    expect(backoffDelay(p, 1)).toBe(100);
    expect(backoffDelay(p, 2)).toBe(200);
    expect(backoffDelay(p, 3)).toBe(400);
    expect(backoffDelay(p, 4)).toBe(800);
    expect(backoffDelay(p, 5)).toBe(1600);
  });

  it("respects a non-default base", () => {
    const p = policy({ baseDelayMs: 250, maxDelayMs: 60_000 });
    expect(backoffDelay(p, 1)).toBe(250);
    expect(backoffDelay(p, 2)).toBe(500);
    expect(backoffDelay(p, 3)).toBe(1000);
  });
});

describe("backoffDelay — cap (jitter: none)", () => {
  it("clamps to maxDelayMs once the exponential exceeds it", () => {
    const p = policy({ baseDelayMs: 100, maxDelayMs: 1000 });
    // 100, 200, 400, 800, then 1600→capped 1000, 3200→capped 1000…
    expect(backoffDelay(p, 4)).toBe(800);
    expect(backoffDelay(p, 5)).toBe(1000);
    expect(backoffDelay(p, 6)).toBe(1000);
    expect(backoffDelay(p, 50)).toBe(1000);
  });

  it("never exceeds maxDelayMs even at extreme attempt numbers", () => {
    const p = policy({ baseDelayMs: 250, maxDelayMs: 30_000 });
    // 2^1000 overflows to Infinity; min(maxDelayMs, Infinity) must stay capped.
    expect(backoffDelay(p, 1000)).toBe(30_000);
  });

  it("a base already at/above the cap yields the cap from attempt 1", () => {
    const p = policy({ baseDelayMs: 5000, maxDelayMs: 1000 });
    expect(backoffDelay(p, 1)).toBe(1000);
  });
});

describe("backoffDelay — full jitter", () => {
  it('"full" returns Math.random() scaled by the capped exponential', () => {
    const p = policy({ baseDelayMs: 100, jitter: "full", maxDelayMs: 10_000 });
    // Pin Math.random so the result is exact: 0.5 * (100 * 2^2) = 200.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(backoffDelay(p, 3)).toBe(200); // 0.5 * 400
    randomSpy.mockRestore();
  });

  it("full jitter stays within [0, cappedExponential] across the range", () => {
    const p = policy({ baseDelayMs: 100, jitter: "full", maxDelayMs: 1000 });
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const ceiling = Math.min(1000, 100 * 2 ** (attempt - 1));
      for (let i = 0; i < 50; i += 1) {
        const d = backoffDelay(p, attempt);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it("jitter is applied to the CAPPED value, not the raw exponential", () => {
    const p = policy({ baseDelayMs: 100, jitter: "full", maxDelayMs: 1000 });
    // attempt 6 → raw 3200, capped 1000; full jitter at random=1 must be the
    // cap (1000), never the uncapped 3200.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(1);
    expect(backoffDelay(p, 6)).toBe(1000);
    randomSpy.mockRestore();
  });

  it('random=0 yields 0 under "full" jitter (immediate retry is possible)', () => {
    const p = policy({ baseDelayMs: 100, jitter: "full", maxDelayMs: 1000 });
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    expect(backoffDelay(p, 3)).toBe(0);
    randomSpy.mockRestore();
  });
});

describe("reconnect policy presets", () => {
  it("NO_RECONNECT disables reconnect (zero attempts)", () => {
    expect(NO_RECONNECT.maxReconnectAttempts).toBe(0);
  });

  it("DEFAULT_RECONNECT_POLICY enables a bounded, jittered backoff", () => {
    expect(DEFAULT_RECONNECT_POLICY.maxReconnectAttempts).toBeGreaterThan(0);
    expect(DEFAULT_RECONNECT_POLICY.jitter).toBe("full");
    expect(DEFAULT_RECONNECT_POLICY.baseDelayMs).toBeGreaterThan(0);
    expect(DEFAULT_RECONNECT_POLICY.maxDelayMs).toBeGreaterThanOrEqual(
      DEFAULT_RECONNECT_POLICY.baseDelayMs
    );
  });

  it("the two presets share the same backoff shape, differing only in attempts", () => {
    expect(NO_RECONNECT.baseDelayMs).toBe(DEFAULT_RECONNECT_POLICY.baseDelayMs);
    expect(NO_RECONNECT.maxDelayMs).toBe(DEFAULT_RECONNECT_POLICY.maxDelayMs);
    expect(NO_RECONNECT.jitter).toBe(DEFAULT_RECONNECT_POLICY.jitter);
  });
});
