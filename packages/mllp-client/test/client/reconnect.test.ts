/**
 * The default reconnect delay, and the wait between attempts.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultReconnectDelay, sleep } from "../../src/client/reconnect";

describe("defaultReconnectDelay()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("doubles the ceiling with each attempt, from 200 ms", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    expect(defaultReconnectDelay(1)).toBe(100);
    expect(defaultReconnectDelay(2)).toBe(200);
    expect(defaultReconnectDelay(3)).toBe(400);
    expect(defaultReconnectDelay(4)).toBe(800);
  });

  it("never exceeds 2 s, however many attempts", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999_999);

    for (const attempt of [5, 6, 10, 30, 1000]) {
      expect(defaultReconnectDelay(attempt)).toBe(1999);
    }
  });

  it("draws from the whole range, zero included", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    expect(defaultReconnectDelay(1)).toBe(0);
    expect(defaultReconnectDelay(9)).toBe(0);
  });

  it("returns a whole number of milliseconds", () => {
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const delay = defaultReconnectDelay(attempt);
      expect(Number.isInteger(delay)).toBe(true);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(2000);
    }
  });
});

describe("sleep()", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves once the time has passed", async () => {
    vi.useFakeTimers();
    const settled = vi.fn();
    const sleeping = sleep(50, new AbortController().signal).then(settled);

    await vi.advanceTimersByTimeAsync(49);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await sleeping;
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("resolves at once when the signal is already aborted", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    abort.abort();

    await sleep(60_000, abort.signal);

    expect(vi.getTimerCount()).toBe(0);
  });

  it("resolves as soon as the signal aborts, and clears its timer", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const settled = vi.fn();
    const sleeping = sleep(60_000, abort.signal).then(settled);
    expect(vi.getTimerCount()).toBe(1);

    abort.abort();
    await sleeping;

    expect(settled).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves no listener on the signal once the time has passed", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const removed = vi.spyOn(abort.signal, "removeEventListener");

    const sleeping = sleep(10, abort.signal);
    await vi.advanceTimersByTimeAsync(10);
    await sleeping;

    expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("does not reject when aborted with a reason", async () => {
    const abort = new AbortController();
    const sleeping = sleep(60_000, abort.signal);
    abort.abort(new Error("closed"));

    await expect(sleeping).resolves.toBeUndefined();
  });
});
