/**
 * Unit tests for the retry options + backoff math (`util/backoff.ts`).
 *
 * `backoffDelay` is pure, so these assert the arithmetic directly — the
 * immediate first retry, the exponential growth from the second, the cap, and
 * the jitter bounds — without the state machine. (The machine's use of it
 * across a retry loop is covered in `state.test.ts`.)
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { backoffDelay, DEFAULT_RETRY, NO_RETRY } from "../src/util/backoff";
import type { RetryOptions } from "../src/util/backoff";

/** Deterministic options (no jitter) for asserting exact delays. */
function options(overrides: Partial<RetryOptions> = {}): RetryOptions {
  return {
    baseDelayMs: 100,
    jitter: "none",
    maxDelayMs: 10_000,
    maxRetries: 5,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("backoffDelay — immediate first retry", () => {
  it("the first retry (attempt 1) is always 0, regardless of base or jitter", () => {
    expect(backoffDelay(options({ baseDelayMs: 100 }), 1)).toBe(0);
    expect(backoffDelay(options({ baseDelayMs: 5000 }), 1)).toBe(0);
    expect(backoffDelay(options({ jitter: "full" }), 1)).toBe(0);
  });
});

describe("backoffDelay — exponential growth from the second retry (jitter: none)", () => {
  it("waits baseDelayMs on attempt 2, then doubles", () => {
    const p = options({ baseDelayMs: 100, maxDelayMs: 10_000 });
    // attempt 1 → 0; attempt n≥2 → baseDelayMs * 2^(n-2)
    expect(backoffDelay(p, 1)).toBe(0);
    expect(backoffDelay(p, 2)).toBe(100);
    expect(backoffDelay(p, 3)).toBe(200);
    expect(backoffDelay(p, 4)).toBe(400);
    expect(backoffDelay(p, 5)).toBe(800);
  });

  it("respects a non-default base", () => {
    const p = options({ baseDelayMs: 250, maxDelayMs: 60_000 });
    expect(backoffDelay(p, 2)).toBe(250);
    expect(backoffDelay(p, 3)).toBe(500);
    expect(backoffDelay(p, 4)).toBe(1000);
  });
});

describe("backoffDelay — cap (jitter: none)", () => {
  it("clamps to maxDelayMs once the exponential exceeds it", () => {
    const p = options({ baseDelayMs: 100, maxDelayMs: 1000 });
    // 0, 100, 200, 400, 800, then 1600→capped 1000…
    expect(backoffDelay(p, 5)).toBe(800);
    expect(backoffDelay(p, 6)).toBe(1000);
    expect(backoffDelay(p, 7)).toBe(1000);
    expect(backoffDelay(p, 50)).toBe(1000);
  });

  it("never exceeds maxDelayMs even at extreme attempt numbers", () => {
    const p = options({ baseDelayMs: 250, maxDelayMs: 30_000 });
    // 2^1000 overflows to Infinity; min(maxDelayMs, Infinity) must stay capped.
    expect(backoffDelay(p, 1000)).toBe(30_000);
  });

  it("a base already at/above the cap yields the cap from the second retry", () => {
    const p = options({ baseDelayMs: 5000, maxDelayMs: 1000 });
    expect(backoffDelay(p, 1)).toBe(0); // first retry still immediate
    expect(backoffDelay(p, 2)).toBe(1000);
  });
});

describe("backoffDelay — full jitter", () => {
  it('"full" returns Math.random() scaled by the capped exponential', () => {
    const p = options({ baseDelayMs: 100, jitter: "full", maxDelayMs: 10_000 });
    // Pin Math.random so the result is exact: 0.5 * (100 * 2^(3-2)) = 100.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(backoffDelay(p, 3)).toBe(100); // 0.5 * 200
    randomSpy.mockRestore();
  });

  it("full jitter stays within [0, cappedExponential] across the range", () => {
    const p = options({ baseDelayMs: 100, jitter: "full", maxDelayMs: 1000 });
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const ceiling =
        attempt <= 1 ? 0 : Math.min(1000, 100 * 2 ** (attempt - 2));
      for (let i = 0; i < 50; i += 1) {
        const d = backoffDelay(p, attempt);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it("jitter is applied to the CAPPED value, not the raw exponential", () => {
    const p = options({ baseDelayMs: 100, jitter: "full", maxDelayMs: 1000 });
    // attempt 7 → raw 100*2^5=3200, capped 1000; full jitter at random=1 must be
    // the cap (1000), never the uncapped 3200.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(1);
    expect(backoffDelay(p, 7)).toBe(1000);
    randomSpy.mockRestore();
  });

  it('random=0 yields 0 under "full" jitter', () => {
    const p = options({ baseDelayMs: 100, jitter: "full", maxDelayMs: 1000 });
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    expect(backoffDelay(p, 3)).toBe(0);
    randomSpy.mockRestore();
  });
});

describe("retry presets", () => {
  it("NO_RETRY disables retry (zero retries)", () => {
    expect(NO_RETRY.maxRetries).toBe(0);
  });

  it("DEFAULT_RETRY enables a bounded, jittered backoff", () => {
    expect(DEFAULT_RETRY.maxRetries).toBeGreaterThan(0);
    expect(DEFAULT_RETRY.jitter).toBe("full");
    expect(DEFAULT_RETRY.baseDelayMs).toBeGreaterThan(0);
    expect(DEFAULT_RETRY.maxDelayMs).toBeGreaterThanOrEqual(
      DEFAULT_RETRY.baseDelayMs
    );
  });

  it("the two presets share the same backoff shape, differing only in retries", () => {
    expect(NO_RETRY.baseDelayMs).toBe(DEFAULT_RETRY.baseDelayMs);
    expect(NO_RETRY.maxDelayMs).toBe(DEFAULT_RETRY.maxDelayMs);
    expect(NO_RETRY.jitter).toBe(DEFAULT_RETRY.jitter);
  });
});
