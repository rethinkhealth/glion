/**
 * Behavioural tests for the connection-lifecycle machine — the engine.
 *
 * These drive the machine directly via events, each carrying a `settle`
 * deferred (the bridge the client uses), and assert the machine's OUTCOME: the
 * deferred resolves on success, or rejects with the exact typed error the
 * machine chose. That is the whole point of the rewrite — the machine owns
 * every error decision, so the tests read those decisions straight off the
 * settled promise rather than inspecting context. Real timers (small delays)
 * are used, matching the wire's real async I/O over the in-memory fake duplex.
 */

import { AckApplicationReject } from "@glion/ack";
import { frame } from "@glion/mllp-transport";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MllpClientResponse } from "../src/ack";
import { NO_RETRY } from "../src/backoff";
import type { RetryOptions } from "../src/backoff";
import type { MllpConnector, MllpDuplex } from "../src/client";
import { MllpErrorCode } from "../src/errors";
import { createConnectionState } from "../src/state";
import type { ConnectionState, Deferred } from "../src/state";
import { createFakeDuplex } from "./fake-duplex";
import type { FakeDuplex } from "./fake-duplex";
import { ACK_AA, ACK_AR, REQUEST, REQUEST_CONTROL_ID } from "./fixtures";

const started: ConnectionState[] = [];

afterEach(() => {
  for (const actor of started) {
    actor.stop();
  }
  started.length = 0;
});

/** A captured deferred — the bridge a caller hands the machine on the event. */
function deferred<T>(): { promise: Promise<T>; settle: Deferred<T> } {
  let capturedResolve: (value: T) => void = () => {};
  let capturedReject: (reason: unknown) => void = () => {};
  // oxlint-disable-next-line promise/avoid-new -- exposing the settlers
  const promise = new Promise<T>((resolve, reject) => {
    capturedResolve = resolve;
    capturedReject = reject;
  });
  return {
    promise,
    settle: { reject: capturedReject, resolve: capturedResolve },
  };
}

function startMachine(
  input: {
    connect?: MllpConnector;
    connectTimeoutMs?: number;
    options?: RetryOptions;
  } = {}
): ConnectionState {
  const connector =
    input.connect ?? (() => Promise.resolve(createFakeDuplex().duplex));
  const actor = createConnectionState({
    connectTimeoutMs: input.connectTimeoutMs ?? 30_000,
    host: "test",
    maxBufferedBytes: undefined,
    open: (signal) => connector({ host: "test", port: 0, signal }),
    options: input.options ?? NO_RETRY,
    port: 0,
  });
  started.push(actor);
  return actor;
}

function phaseOf(actor: ConnectionState): string {
  const phase = actor.getSnapshot().value;
  return typeof phase === "string" ? phase : "connected";
}

/** Drive CONNECT and return the caller's promise. */
function connect(actor: ConnectionState): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- bridge: machine event → caller promise
  return new Promise<void>((resolve, reject) => {
    actor.send({ settle: { reject, resolve }, type: "CONNECT" });
  });
}

/** Drive SEND and return the caller's promise. */
function sendMessage(
  actor: ConnectionState,
  message: string = REQUEST,
  controlId: string = REQUEST_CONTROL_ID,
  timeoutMs = 1000
): Promise<MllpClientResponse> {
  const { promise, settle } = deferred<MllpClientResponse>();
  actor.send({
    framed: frame(message),
    requestControlId: controlId,
    settle,
    timeoutMs,
    type: "SEND",
  });
  return promise;
}

/** A connector whose single attempt the test resolves or rejects on demand. */
function deferredConnect(): {
  connect: MllpConnector;
  reject: (error: unknown) => void;
  resolve: (duplex: MllpDuplex) => void;
} {
  let capturedResolve: (duplex: MllpDuplex) => void = () => {};
  let capturedReject: (error: unknown) => void = () => {};
  const connector: MllpConnector = () =>
    // oxlint-disable-next-line promise/avoid-new -- exposing the settlers
    new Promise<MllpDuplex>((resolve, reject) => {
      capturedResolve = resolve;
      capturedReject = reject;
    });
  return {
    connect: connector,
    reject: (error) => capturedReject(error),
    resolve: (duplex) => capturedResolve(duplex),
  };
}

/** A connector that plays a fixed script of outcomes, in order. */
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

const FAST_RETRY: RetryOptions = {
  baseDelayMs: 5,
  jitter: "none",
  maxDelayMs: 50,
  maxRetries: 2,
};

// Holds `backingOff` open long enough to assert legality there. The first retry
// window is 0ms (immediate), so a second failure is needed to land in a window
// the test can observe; the large base keeps that window open across the assert.
const SLOW_RETRY: RetryOptions = {
  baseDelayMs: 10_000,
  jitter: "none",
  maxDelayMs: 10_000,
  maxRetries: 5,
};

/** Park the machine in `backingOff` (second, long retry window) and return it. */
async function backingOff(): Promise<ConnectionState> {
  const actor = startMachine({
    connect: scriptedConnect(["reject", "reject"]),
    options: SLOW_RETRY,
  });
  // The connect stays parked across retries; swallow so it never surfaces as an
  // unhandled rejection when the test stops the actor mid-backoff.
  void connect(actor).catch(() => {
    /* parked across retries */
  });
  await vi.waitFor(() => expect(phaseOf(actor)).toBe("backingOff"));
  return actor;
}

describe("connect", () => {
  it("resolves when the connection opens (idle → connecting → connected)", async () => {
    const { connect: connector, resolve } = deferredConnect();
    const actor = startMachine({ connect: connector });
    expect(phaseOf(actor)).toBe("idle");

    const connecting = connect(actor);
    expect(phaseOf(actor)).toBe("connecting");

    resolve(createFakeDuplex().duplex);
    await connecting;
    expect(phaseOf(actor)).toBe("connected");
  });

  it("rejects with CONNECT_FAILED when the attempt fails and retry is off", async () => {
    const actor = startMachine({ connect: scriptedConnect(["reject"]) });
    await expect(connect(actor)).rejects.toMatchObject({
      code: MllpErrorCode.CONNECT_FAILED,
    });
    expect(phaseOf(actor)).toBe("closed");
  });

  it("rejects with CONNECT_TIMEOUT when the attempt exceeds connectTimeoutMs", async () => {
    const { connect: connector } = deferredConnect(); // never resolves
    const actor = startMachine({ connect: connector, connectTimeoutMs: 10 });
    await expect(connect(actor)).rejects.toMatchObject({
      code: MllpErrorCode.CONNECT_TIMEOUT,
    });
    expect(phaseOf(actor)).toBe("closed");
  });

  it("rejects with CONNECT_ABORTED when CLOSE interrupts the attempt", async () => {
    const { connect: connector } = deferredConnect(); // still pending
    const actor = startMachine({ connect: connector });
    const connecting = connect(actor);
    actor.send({ type: "CLOSE" });
    await expect(connecting).rejects.toMatchObject({
      code: MllpErrorCode.CONNECT_ABORTED,
    });
    expect(phaseOf(actor)).toBe("closed");
  });

  // The orphan-close on a post-abort open race is now the OpenConnection
  // contract's job (the client's open closure), so it is tested at the client
  // layer in client.test.ts, not here — the machine just forwards the signal.

  it("retries a failed attempt when retry is enabled, then connects", async () => {
    const actor = startMachine({
      connect: scriptedConnect(["reject", createFakeDuplex().duplex]),
      options: FAST_RETRY,
    });
    await connect(actor);
    expect(phaseOf(actor)).toBe("connected");
  });

  it("gives up with CONNECT_FAILED after the configured retries", async () => {
    const actor = startMachine({
      connect: scriptedConnect(["reject", "reject", "reject"]),
      options: FAST_RETRY,
    });
    await expect(connect(actor)).rejects.toMatchObject({
      code: MllpErrorCode.CONNECT_FAILED,
    });
    expect(phaseOf(actor)).toBe("closed");
  });

  it("retries multiple times before succeeding (two attempt cycles)", async () => {
    const actor = startMachine({
      connect: scriptedConnect(["reject", "reject", createFakeDuplex().duplex]),
      options: FAST_RETRY,
    });
    await connect(actor);
    expect(phaseOf(actor)).toBe("connected");
  });
});

describe("send", () => {
  async function connected(fake: FakeDuplex): Promise<ConnectionState> {
    const actor = startMachine({ connect: () => Promise.resolve(fake.duplex) });
    await connect(actor);
    return actor;
  }

  it("resolves with the parsed ACK on an accept", async () => {
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => peer.injectPeerBytes(frame(ACK_AA)),
    });
    const actor = await connected(fake);
    const response = await sendMessage(actor);
    expect(response.code).toBe("AA");
    expect(response.controlId).toBe(REQUEST_CONTROL_ID);
    expect(phaseOf(actor)).toBe("connected");
  });

  it("rejects with the AckException on a NAK", async () => {
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => peer.injectPeerBytes(frame(ACK_AR)),
    });
    const actor = await connected(fake);
    await expect(sendMessage(actor)).rejects.toBeInstanceOf(
      AckApplicationReject
    );
  });

  it("rejects with SEND_TIMEOUT and stays connected", async () => {
    const fake = createFakeDuplex({ onWrite: () => {} }); // peer never answers
    const actor = await connected(fake);
    await expect(
      sendMessage(actor, REQUEST, REQUEST_CONTROL_ID, 20)
    ).rejects.toMatchObject({
      code: MllpErrorCode.SEND_TIMEOUT,
    });
    expect(phaseOf(actor)).toBe("connected");
  });

  it("rejects a concurrent send with SEND_IN_PROGRESS (single-flight)", async () => {
    const fake = createFakeDuplex({ onWrite: () => {} }); // hold the first send
    const actor = await connected(fake);
    const first = sendMessage(actor, REQUEST, REQUEST_CONTROL_ID, 50);
    const second = sendMessage(actor);
    await expect(second).rejects.toMatchObject({
      code: MllpErrorCode.SEND_IN_PROGRESS,
    });
    // The first send is still single-flight; let it time out so it settles.
    await expect(first).rejects.toMatchObject({
      code: MllpErrorCode.SEND_TIMEOUT,
    });
  });

  it("releases the wire after a send so the next one succeeds", async () => {
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => peer.injectPeerBytes(frame(ACK_AA)),
    });
    const actor = await connected(fake);
    const first = await sendMessage(actor);
    expect(first.code).toBe("AA");
    const second = await sendMessage(actor);
    expect(second.code).toBe("AA");
  });
});

describe("drop", () => {
  it("closes on a peer drop when retry is off and rejects the in-flight send", async () => {
    const fake = createFakeDuplex({ onWrite: () => {} });
    const actor = startMachine({ connect: () => Promise.resolve(fake.duplex) });
    await connect(actor);

    const inflight = sendMessage(actor, REQUEST, REQUEST_CONTROL_ID, 1000);
    fake.closePeer();
    await expect(inflight).rejects.toMatchObject({
      code: MllpErrorCode.DROPPED,
    });
    expect(phaseOf(actor)).toBe("closed");
  });

  it("reconnects after a drop when retry is enabled", async () => {
    let fakes = 0;
    const live = createFakeDuplex();
    const dropping = createFakeDuplex();
    const connector: MllpConnector = () => {
      fakes += 1;
      return Promise.resolve(fakes === 1 ? dropping.duplex : live.duplex);
    };
    const actor = startMachine({ connect: connector, options: FAST_RETRY });
    await connect(actor);
    expect(phaseOf(actor)).toBe("connected");

    dropping.closePeer();
    // Let the drop propagate and the immediate retry reconnect.
    await vi.waitFor(() => expect(phaseOf(actor)).toBe("connected"));
  });

  it("rejects the in-flight send with DROPPED, then the next send works after reconnect", async () => {
    let fakes = 0;
    const dropping = createFakeDuplex({ onWrite: () => {} }); // never ACKs
    const live = createFakeDuplex({
      onWrite: (_chunk, peer) => peer.injectPeerBytes(frame(ACK_AA)),
    });
    const connector: MllpConnector = () => {
      fakes += 1;
      return Promise.resolve(fakes === 1 ? dropping.duplex : live.duplex);
    };
    const actor = startMachine({ connect: connector, options: FAST_RETRY });
    await connect(actor);

    const inflight = sendMessage(actor, REQUEST, REQUEST_CONTROL_ID, 1000);
    dropping.closePeer();
    await expect(inflight).rejects.toMatchObject({
      code: MllpErrorCode.DROPPED,
    });

    await vi.waitFor(() => expect(phaseOf(actor)).toBe("connected"));
    const response = await sendMessage(actor);
    expect(response.code).toBe("AA");
  });
});

describe("legality — the machine owns which error", () => {
  it("SEND before connected rejects with NOT_CONNECTED", async () => {
    const actor = startMachine();
    await expect(sendMessage(actor)).rejects.toMatchObject({
      code: MllpErrorCode.NOT_CONNECTED,
    });
  });

  it("a second CONNECT rejects with ALREADY_CONNECTED", async () => {
    const actor = startMachine();
    await connect(actor);
    await expect(connect(actor)).rejects.toMatchObject({
      code: MllpErrorCode.ALREADY_CONNECTED,
    });
  });

  it("SEND while connecting rejects with NOT_CONNECTED", async () => {
    const { connect: connector } = deferredConnect(); // parks in `connecting`
    const actor = startMachine({ connect: connector });
    void connect(actor).catch(() => {
      /* parked */
    });
    expect(phaseOf(actor)).toBe("connecting");
    await expect(sendMessage(actor)).rejects.toMatchObject({
      code: MllpErrorCode.NOT_CONNECTED,
    });
  });

  it("a second CONNECT while connecting rejects with ALREADY_CONNECTED", async () => {
    const { connect: connector } = deferredConnect(); // parks in `connecting`
    const actor = startMachine({ connect: connector });
    void connect(actor).catch(() => {
      /* parked */
    });
    expect(phaseOf(actor)).toBe("connecting");
    await expect(connect(actor)).rejects.toMatchObject({
      code: MllpErrorCode.ALREADY_CONNECTED,
    });
  });

  it("SEND while backingOff rejects with NOT_CONNECTED", async () => {
    const actor = await backingOff();
    await expect(sendMessage(actor)).rejects.toMatchObject({
      code: MllpErrorCode.NOT_CONNECTED,
    });
  });

  it("a CONNECT while backingOff rejects with ALREADY_CONNECTED", async () => {
    const actor = await backingOff();
    await expect(connect(actor)).rejects.toMatchObject({
      code: MllpErrorCode.ALREADY_CONNECTED,
    });
  });

  it("CONNECT and SEND after close reject with CLOSED", async () => {
    const actor = startMachine();
    actor.send({ type: "CLOSE" });
    expect(phaseOf(actor)).toBe("closed");
    await expect(connect(actor)).rejects.toMatchObject({
      code: MllpErrorCode.CLOSED,
    });
    await expect(sendMessage(actor)).rejects.toMatchObject({
      code: MllpErrorCode.CLOSED,
    });
  });
});

describe("close", () => {
  it("closes from idle, connecting, and connected", async () => {
    const fromIdle = startMachine();
    fromIdle.send({ type: "CLOSE" });
    expect(phaseOf(fromIdle)).toBe("closed");

    const { connect: connector } = deferredConnect();
    const fromConnecting = startMachine({ connect: connector });
    const connecting = connect(fromConnecting);
    fromConnecting.send({ type: "CLOSE" });
    await expect(connecting).rejects.toMatchObject({
      code: MllpErrorCode.CONNECT_ABORTED,
    });
    expect(phaseOf(fromConnecting)).toBe("closed");

    const fromConnected = startMachine();
    await connect(fromConnected);
    fromConnected.send({ type: "CLOSE" });
    expect(phaseOf(fromConnected)).toBe("closed");
  });

  it("rejects an in-flight send with CLOSED", async () => {
    const fake = createFakeDuplex({ onWrite: () => {} });
    const actor = startMachine({ connect: () => Promise.resolve(fake.duplex) });
    await connect(actor);

    const inflight = sendMessage(actor, REQUEST, REQUEST_CONTROL_ID, 1000);
    actor.send({ type: "CLOSE" });
    await expect(inflight).rejects.toMatchObject({
      code: MllpErrorCode.CLOSED,
    });
  });
});
