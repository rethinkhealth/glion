/**
 * Behavioural tests for the connection-lifecycle machine.
 *
 * The machine owns opening the connection (an invoked actor), so these drive it
 * controllable fake connector: send `CONNECT`, then resolve / reject / stall
 * the attempt and read the resulting state. They never inspect internals (the
 * attempt counter, the exact backoff delay — those are pinned in
 * backoff.test.ts). `vi.runAllTimersAsync()` waits out whatever backoff is
 * pending; a 0ms advance just flushes the open promise without firing the long
 * connect timeout.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_RETRY, NO_RETRY } from "../src/backoff";
import type { RetryOptions } from "../src/backoff";
import type { MllpConnector, MllpDuplex } from "../src/client";
import { MllpClientError, MllpErrorCode } from "../src/errors";
import { createConnectionState } from "../src/state";
import type { ConnectionState } from "../src/state";

function makeFakeDuplex(onClose?: () => void): MllpDuplex {
  return {
    close: () => {
      onClose?.();
      return Promise.resolve();
    },
    // The machine never reads `closed` (the client's read loop watches it).
    // oxlint-disable-next-line promise/avoid-new -- a never-settling stub
    closed: new Promise<void>(() => {}),
    readable: new ReadableStream<Uint8Array>(),
    writable: new WritableStream<Uint8Array>(),
  };
}

/** A connector whose single attempt the test resolves or rejects on demand. */
function deferredConnect(): {
  connect: MllpConnector;
  resolve: (duplex: MllpDuplex) => void;
  reject: (error: unknown) => void;
} {
  let settleResolve: (duplex: MllpDuplex) => void = () => {};
  let settleReject: (error: unknown) => void = () => {};
  const connect: MllpConnector = () =>
    // oxlint-disable-next-line promise/avoid-new -- exposing the settlers
    new Promise<MllpDuplex>((resolve, reject) => {
      settleResolve = resolve;
      settleReject = reject;
    });
  return {
    connect,
    reject: (error) => settleReject(error),
    resolve: (duplex) => settleResolve(duplex),
  };
}

/** A connector that plays out a fixed script of connection outcomes, in order. */
function scriptedConnect(
  outcomes: ReadonlyArray<MllpDuplex | "reject">
): MllpConnector {
  let i = 0;
  return () => {
    const outcome = outcomes[i] ?? "reject";
    i += 1;
    return outcome === "reject"
      ? Promise.reject(new Error("connection failed"))
      : Promise.resolve(outcome);
  };
}

function startMachine(
  input: {
    options?: RetryOptions;
    connectTimeoutMs?: number;
    connect?: MllpConnector;
  } = {}
): ConnectionState {
  const connect = input.connect ?? (() => Promise.resolve(makeFakeDuplex()));
  return createConnectionState({
    connectTimeoutMs: input.connectTimeoutMs ?? 30_000,
    open: (signal) => connect({ host: "test", port: 0, signal }),
    options: input.options ?? NO_RETRY,
  });
}

function phaseOf(actor: ConnectionState): string {
  return actor.getSnapshot().value as string;
}

function errorCodeOf(actor: ConnectionState): string | undefined {
  return actor.getSnapshot().context.error?.code;
}

/** Flush the open promise (microtasks) without firing the long connect timer. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("connection state machine", () => {
  it("connects: idle → connecting → connected when the connection opens", async () => {
    const { connect, resolve } = deferredConnect();
    const actor = startMachine({ connect });
    expect(phaseOf(actor)).toBe("idle");

    actor.send({ type: "CONNECT" });
    expect(phaseOf(actor)).toBe("connecting");

    resolve(makeFakeDuplex());
    await settle();
    expect(phaseOf(actor)).toBe("connected");
  });

  it("closes with CONNECT_FAILED on a failed attempt when retry is disabled", async () => {
    const actor = startMachine({ connect: scriptedConnect(["reject"]) });
    actor.send({ type: "CONNECT" });
    await settle();

    expect(phaseOf(actor)).toBe("closed");
    expect(errorCodeOf(actor)).toBe(MllpErrorCode.CONNECT_FAILED);
  });

  it("retries a failed initial attempt when retry is enabled (does not fail fast)", async () => {
    // Connect and reconnect are one path: the FIRST connect failure routes
    // through the retry gate. The second attempt succeeds, proving it retried.
    const actor = startMachine({
      connect: scriptedConnect(["reject", makeFakeDuplex()]),
      options: DEFAULT_RETRY,
    });
    actor.send({ type: "CONNECT" });
    await vi.runAllTimersAsync();

    expect(phaseOf(actor)).toBe("connected");
  });

  it("closes with CONNECT_TIMEOUT when the attempt exceeds connectTimeoutMs", async () => {
    const { connect } = deferredConnect(); // never resolves
    const actor = startMachine({ connect, connectTimeoutMs: 10 });
    actor.send({ type: "CONNECT" });

    await vi.advanceTimersByTimeAsync(10);
    expect(phaseOf(actor)).toBe("closed");
    expect(errorCodeOf(actor)).toBe(MllpErrorCode.CONNECT_TIMEOUT);
  });

  it("closes with CONNECT_ABORTED when CLOSE interrupts the attempt", () => {
    const { connect } = deferredConnect(); // attempt still pending
    const actor = startMachine({ connect });
    actor.send({ type: "CONNECT" });
    actor.send({ type: "CLOSE" });

    expect(phaseOf(actor)).toBe("closed");
    expect(errorCodeOf(actor)).toBe(MllpErrorCode.CONNECT_ABORTED);
  });

  it("closes an orphaned duplex when CLOSE wins the open race", async () => {
    let closeCount = 0;
    const orphan = makeFakeDuplex(() => {
      closeCount += 1;
    });
    const { connect, resolve } = deferredConnect();
    const actor = startMachine({ connect });

    actor.send({ type: "CONNECT" });
    actor.send({ type: "CLOSE" }); // exits connecting → aborts the open signal
    resolve(orphan); // the connection opens anyway — the orphan must be closed
    await settle();

    expect(closeCount).toBe(1);
  });

  it("closes on a drop when retry is disabled", async () => {
    const actor = startMachine({
      connect: scriptedConnect([makeFakeDuplex()]),
    });
    actor.send({ type: "CONNECT" });
    await settle();
    expect(phaseOf(actor)).toBe("connected");

    actor.send({
      error: new MllpClientError(MllpErrorCode.DROPPED, "peer drop"),
      type: "DROP",
    });
    expect(phaseOf(actor)).toBe("closed");
    expect(errorCodeOf(actor)).toBe(MllpErrorCode.DROPPED);
  });

  it("retries after a drop when retry is enabled", async () => {
    const actor = startMachine({
      connect: scriptedConnect([makeFakeDuplex(), makeFakeDuplex()]),
      options: DEFAULT_RETRY,
    });
    actor.send({ type: "CONNECT" });
    await settle();
    expect(phaseOf(actor)).toBe("connected");

    actor.send({
      error: new MllpClientError(MllpErrorCode.DROPPED, "peer drop"),
      type: "DROP",
    });
    expect(phaseOf(actor)).not.toBe("closed");

    await vi.runAllTimersAsync();
    expect(phaseOf(actor)).toBe("connected");
  });

  it("gives up after the configured number of retries", async () => {
    const actor = startMachine({
      connect: scriptedConnect(["reject", "reject", "reject"]),
      options: { ...DEFAULT_RETRY, maxRetries: 2 },
    });
    actor.send({ type: "CONNECT" });

    await vi.runAllTimersAsync();
    expect(phaseOf(actor)).toBe("closed");
  });

  it("closes from any live state when asked", async () => {
    const fromIdle = startMachine({ options: DEFAULT_RETRY });
    fromIdle.send({ type: "CLOSE" });
    expect(phaseOf(fromIdle)).toBe("closed");

    const fromConnecting = startMachine({
      connect: deferredConnect().connect,
      options: DEFAULT_RETRY,
    });
    fromConnecting.send({ type: "CONNECT" });
    fromConnecting.send({ type: "CLOSE" });
    expect(phaseOf(fromConnecting)).toBe("closed");

    const fromConnected = startMachine({
      connect: scriptedConnect([makeFakeDuplex()]),
      options: DEFAULT_RETRY,
    });
    fromConnected.send({ type: "CONNECT" });
    await settle();
    fromConnected.send({ type: "CLOSE" });
    expect(phaseOf(fromConnected)).toBe("closed");
  });

  it("a pending retry does not fire after close", async () => {
    const actor = startMachine({
      connect: scriptedConnect([makeFakeDuplex()]),
      options: DEFAULT_RETRY,
    });
    actor.send({ type: "CONNECT" });
    await settle();
    actor.send({
      error: new MllpClientError(MllpErrorCode.DROPPED, "peer drop"),
      type: "DROP",
    });

    actor.send({ type: "CLOSE" });
    expect(phaseOf(actor)).toBe("closed");

    // The backoff timer must have been cancelled — no reconnect happens.
    await vi.runAllTimersAsync();
    expect(phaseOf(actor)).toBe("closed");
  });
});
