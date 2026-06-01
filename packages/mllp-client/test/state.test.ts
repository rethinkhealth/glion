/**
 * Behavioural tests for the connection-lifecycle machine.
 *
 * These drive the machine purely through its public surface — send an event,
 * read the resulting state — and never inspect internals (the attempt counter,
 * the exact backoff delay, the jitter formula). `vi.runAllTimersAsync()` waits
 * out whatever backoff delay is pending without caring how long it is, so the
 * tests stay decoupled from the timing maths.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_RECONNECT_POLICY, NO_RECONNECT } from "../src/reconnect";
import type { ReconnectPolicy } from "../src/reconnect";
import { createConnectionState } from "../src/state";
import type { ConnectionState } from "../src/state";

function startMachine(policy: ReconnectPolicy): ConnectionState {
  return createConnectionState(policy);
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
    const actor = startMachine(NO_RECONNECT);
    expect(phaseOf(actor)).toBe("idle");
    actor.send({ type: "CONNECT" });
    expect(phaseOf(actor)).toBe("connecting");
    actor.send({ type: "CONNECTED" });
    expect(phaseOf(actor)).toBe("connected");
  });

  it("closes immediately when the initial connect fails — it never retries", () => {
    // Reconnect is enabled, yet the FIRST connect still fails fast.
    const actor = startMachine(DEFAULT_RECONNECT_POLICY);
    actor.send({ type: "CONNECT" });
    actor.send({ type: "CONNECT_FAILED" });
    expect(phaseOf(actor)).toBe("closed");
  });

  it("closes on a drop when reconnect is disabled", () => {
    const actor = startMachine(NO_RECONNECT);
    actor.send({ type: "CONNECT" });
    actor.send({ type: "CONNECTED" });
    actor.send({ type: "DROP" });
    expect(phaseOf(actor)).toBe("closed");
  });

  it("reconnects after a drop when reconnect is enabled", async () => {
    const actor = startMachine(DEFAULT_RECONNECT_POLICY);
    actor.send({ type: "CONNECT" });
    actor.send({ type: "CONNECTED" });

    actor.send({ type: "DROP" });
    // It is retrying, not giving up.
    expect(phaseOf(actor)).not.toBe("closed");

    // Wait out the backoff; a successful redial restores the connection.
    await vi.runAllTimersAsync();
    expect(phaseOf(actor)).toBe("reconnecting");
    actor.send({ type: "CONNECTED" });
    expect(phaseOf(actor)).toBe("connected");
  });

  it("gives up after the configured number of reconnect attempts", async () => {
    const actor = startMachine({
      ...DEFAULT_RECONNECT_POLICY,
      maxReconnectAttempts: 2,
    });
    actor.send({ type: "CONNECT" });
    actor.send({ type: "CONNECTED" });
    actor.send({ type: "DROP" });

    // Two redials, both failing. After the second the machine is out of
    // attempts and closes.
    await vi.runAllTimersAsync();
    actor.send({ type: "RECONNECT_FAILED" });
    await vi.runAllTimersAsync();
    actor.send({ type: "RECONNECT_FAILED" });

    expect(phaseOf(actor)).toBe("closed");
  });

  it("closes from any live state when asked", () => {
    const fromIdle = startMachine(DEFAULT_RECONNECT_POLICY);
    fromIdle.send({ type: "CLOSE" });
    expect(phaseOf(fromIdle)).toBe("closed");

    const fromConnecting = startMachine(DEFAULT_RECONNECT_POLICY);
    fromConnecting.send({ type: "CONNECT" });
    fromConnecting.send({ type: "CLOSE" });
    expect(phaseOf(fromConnecting)).toBe("closed");

    const fromConnected = startMachine(DEFAULT_RECONNECT_POLICY);
    fromConnected.send({ type: "CONNECT" });
    fromConnected.send({ type: "CONNECTED" });
    fromConnected.send({ type: "CLOSE" });
    expect(phaseOf(fromConnected)).toBe("closed");
  });

  it("a pending reconnect does not fire after close", async () => {
    const actor = startMachine(DEFAULT_RECONNECT_POLICY);
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
