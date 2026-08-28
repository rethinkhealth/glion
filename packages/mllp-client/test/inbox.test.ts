/**
 * Unit tests for the response inbox — the inbound side of one MLLP connection,
 * tested with zero I/O. These pin the contract `connection.ts` builds on:
 * FIFO queueing, deliver-to-the-pending-ACK, drain-queued-before-deadline,
 * the `size` the connection watches for its flood policy, and the close
 * semantics (first reason wins; the pending ACK rejects; later takes reject
 * with the same failure; later deliveries are discarded).
 */

import { describe, expect, it } from "vitest";

import { createResponseInbox } from "../src/inbox";

const RESPONSE_A = new Uint8Array([0x41]);
const RESPONSE_B = new Uint8Array([0x42]);
const RESPONSE_C = new Uint8Array([0x43]);

/** A signal that never aborts — takes that should settle by deliver/close. */
function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

describe("deliver then take", () => {
  it("drains queued responses in FIFO order", async () => {
    const inbox = createResponseInbox();
    inbox.deliver(RESPONSE_A);
    inbox.deliver(RESPONSE_B);
    await expect(inbox.take(liveSignal())).resolves.toBe(RESPONSE_A);
    await expect(inbox.take(liveSignal())).resolves.toBe(RESPONSE_B);
  });

  it("serves a queued response even when the signal already aborted (drain first)", async () => {
    // A late ACK queued between sends must reach the next take so the
    // correlation check can reject it — the deadline only bounds the WAIT.
    const inbox = createResponseInbox();
    inbox.deliver(RESPONSE_A);
    const aborted = new AbortController();
    aborted.abort(new Error("deadline"));
    await expect(inbox.take(aborted.signal)).resolves.toBe(RESPONSE_A);
  });

  it("reports queued responses via size", () => {
    const inbox = createResponseInbox();
    expect(inbox.size).toBe(0);
    inbox.deliver(RESPONSE_A);
    inbox.deliver(RESPONSE_B);
    expect(inbox.size).toBe(2);
  });
});

describe("take then deliver", () => {
  it("hands the next response to the pending ACK without queueing it", async () => {
    const inbox = createResponseInbox();
    const taking = inbox.take(liveSignal());
    inbox.deliver(RESPONSE_A);
    expect(inbox.size).toBe(0);
    await expect(taking).resolves.toBe(RESPONSE_A);
  });
});

describe("ACK deadline", () => {
  it("rejects the pending ACK with the signal's reason on abort", async () => {
    const inbox = createResponseInbox();
    const deadline = new AbortController();
    const reason = new Error("the caller's deadline error");
    const taking = inbox.take(deadline.signal);
    deadline.abort(reason);
    await expect(taking).rejects.toBe(reason);
  });

  it("rejects immediately with the reason when the signal aborted and nothing is queued", async () => {
    const inbox = createResponseInbox();
    const aborted = new AbortController();
    const reason = new Error("already expired");
    aborted.abort(reason);
    await expect(inbox.take(aborted.signal)).rejects.toBe(reason);
  });

  it("clears the pending ACK on abort: a later response queues instead of reaching the dead take", async () => {
    const inbox = createResponseInbox();
    const deadline = new AbortController();
    const timedOut = inbox.take(deadline.signal);
    deadline.abort(new Error("deadline"));
    await expect(timedOut).rejects.toBeInstanceOf(Error);

    inbox.deliver(RESPONSE_C); // queued — the old take is gone
    expect(inbox.size).toBe(1);
    await expect(inbox.take(liveSignal())).resolves.toBe(RESPONSE_C);
  });
});

describe("close", () => {
  it("is idempotent: the first reason wins", () => {
    const inbox = createResponseInbox();
    const first = new Error("first");
    inbox.close(first);
    inbox.close(new Error("second"));
    expect(inbox.failure).toBe(first);
  });

  it("rejects the pending ACK with the exact failure", async () => {
    const inbox = createResponseInbox();
    const taking = inbox.take(liveSignal());
    const failure = new Error("connection dropped");
    inbox.close(failure);
    await expect(taking).rejects.toBe(failure);
  });

  it("rejects every later take with the same failure", async () => {
    const inbox = createResponseInbox();
    const failure = new Error("connection dropped");
    inbox.close(failure);
    await expect(inbox.take(liveSignal())).rejects.toBe(failure);
    await expect(inbox.take(liveSignal())).rejects.toBe(failure);
  });

  it("discards queued responses", async () => {
    const inbox = createResponseInbox();
    inbox.deliver(RESPONSE_A);
    const failure = new Error("connection dropped");
    inbox.close(failure);
    expect(inbox.size).toBe(0);
    await expect(inbox.take(liveSignal())).rejects.toBe(failure);
  });

  it("discards later deliveries silently", () => {
    const inbox = createResponseInbox();
    inbox.close(new Error("connection dropped"));
    inbox.deliver(RESPONSE_A);
    inbox.deliver(RESPONSE_B);
    expect(inbox.size).toBe(0);
  });
});
