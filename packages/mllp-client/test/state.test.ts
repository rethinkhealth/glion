/**
 * Behavioural tests for the connection-lifecycle machine.
 *
 * These drive the machine purely through its public surface — send an event,
 * read the resulting state — and never inspect internals (the attempt counter,
 * the exact backoff delay, the jitter formula; the delay maths are pinned in
 * backoff.test.ts). `vi.runAllTimersAsync()` waits out whatever backoff delay
 * is pending without caring how long it is.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createConnectionState } from "../src/state";
import type { ConnectionState } from "../src/state";
import { DEFAULT_RETRY, NO_RETRY } from "../src/util/backoff";
import type { RetryOptions } from "../src/util/backoff";

function startMachine(options: RetryOptions): ConnectionState {
  return createConnectionState(options);
}

function phaseOf(actor: ConnectionState): string {
  return actor.getSnapshot().value as string;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("connection state machine", () => {
  it("connects: idle → connecting → connected", () => {
    const actor = startMachine(NO_RETRY);
    expect(phaseOf(actor)).toBe("idle");
    actor.send({ type: "CONNECT" });
    expect(phaseOf(actor)).toBe("connecting");
    actor.send({ type: "CONNECTED" });
    expect(phaseOf(actor)).toBe("connected");
  });

  it("closes on a failed initial dial when retry is disabled", () => {
    const actor = startMachine(NO_RETRY);
    actor.send({ type: "CONNECT" });
    actor.send({ type: "FAILED" });
    expect(phaseOf(actor)).toBe("closed");
  });

  it("retries a failed initial dial when retry is enabled (does not fail fast)", () => {
    // A dial is a dial: the FIRST connect failure routes through the retry gate
    // like any redial, not straight to closed.
    const actor = startMachine(DEFAULT_RETRY);
    actor.send({ type: "CONNECT" });
    actor.send({ type: "FAILED" });
    expect(phaseOf(actor)).not.toBe("closed");
  });

  it("closes on a drop when retry is disabled", () => {
    const actor = startMachine(NO_RETRY);
    actor.send({ type: "CONNECT" });
    actor.send({ type: "CONNECTED" });
    actor.send({ type: "DROP" });
    expect(phaseOf(actor)).toBe("closed");
  });

  it("retries after a drop when retry is enabled", async () => {
    const actor = startMachine(DEFAULT_RETRY);
    actor.send({ type: "CONNECT" });
    actor.send({ type: "CONNECTED" });

    actor.send({ type: "DROP" });
    // It is retrying, not giving up.
    expect(phaseOf(actor)).not.toBe("closed");

    // Wait out the (immediate, first) backoff; the machine re-dials.
    await vi.runAllTimersAsync();
    expect(phaseOf(actor)).toBe("connecting");
    actor.send({ type: "CONNECTED" });
    expect(phaseOf(actor)).toBe("connected");
  });

  it("gives up after the configured number of retries", async () => {
    const actor = startMachine({ ...DEFAULT_RETRY, maxRetries: 2 });
    actor.send({ type: "CONNECT" });
    actor.send({ type: "CONNECTED" });
    actor.send({ type: "DROP" });

    // Re-dial #1 fails; re-dial #2 fails; out of retries → closed.
    await vi.runAllTimersAsync();
    actor.send({ type: "FAILED" });
    await vi.runAllTimersAsync();
    actor.send({ type: "FAILED" });

    expect(phaseOf(actor)).toBe("closed");
  });

  it("closes from any live state when asked", () => {
    const fromIdle = startMachine(DEFAULT_RETRY);
    fromIdle.send({ type: "CLOSE" });
    expect(phaseOf(fromIdle)).toBe("closed");

    const fromConnecting = startMachine(DEFAULT_RETRY);
    fromConnecting.send({ type: "CONNECT" });
    fromConnecting.send({ type: "CLOSE" });
    expect(phaseOf(fromConnecting)).toBe("closed");

    const fromConnected = startMachine(DEFAULT_RETRY);
    fromConnected.send({ type: "CONNECT" });
    fromConnected.send({ type: "CONNECTED" });
    fromConnected.send({ type: "CLOSE" });
    expect(phaseOf(fromConnected)).toBe("closed");
  });

  it("a pending retry does not fire after close", async () => {
    const actor = startMachine(DEFAULT_RETRY);
    actor.send({ type: "CONNECT" });
    actor.send({ type: "CONNECTED" });
    actor.send({ type: "DROP" });

    actor.send({ type: "CLOSE" });
    expect(phaseOf(actor)).toBe("closed");

    // The backoff timer must have been cancelled — no redial happens.
    await vi.runAllTimersAsync();
    expect(phaseOf(actor)).toBe("closed");
  });
});
