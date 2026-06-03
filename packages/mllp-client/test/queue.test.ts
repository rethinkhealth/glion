/**
 * Tests for the pure send queue (`createSendQueue`).
 *
 * The whole point of the queue is that it is wire-agnostic: no sockets, no
 * state machine, no connection. These tests exercise it directly — enqueue,
 * take, failAll, depth — and settle the returned promises by hand, exactly as
 * the manager's drain loop would. The `MllpClientResponse` is never inspected
 * by the queue, so a tiny structural stand-in is enough.
 */

import { describe, expect, it } from "vitest";

import { MllpClientError, MllpErrorCode } from "../src/errors";
import type { MllpClientResponse } from "../src/message";
import { createSendQueue } from "../src/util/queue";

const BYTES = new Uint8Array([0x0b, 0x4d, 0x53, 0x48, 0x1c, 0x0d]);

/** The queue never reads the response shape, so a structural stand-in suffices. */
function fakeResponse(code: "AA" | "CA" = "AA"): MllpClientResponse {
  return { code } as unknown as MllpClientResponse;
}

describe("createSendQueue", () => {
  it("starts empty", () => {
    const queue = createSendQueue();
    expect(queue.depth).toBe(0);
    expect(queue.take()).toBeUndefined();
  });

  it("enqueue returns a real Promise and increments depth", () => {
    const queue = createSendQueue();
    const promise = queue.enqueue(BYTES, "MSG1", 1000);
    expect(promise).toBeInstanceOf(Promise);
    expect(queue.depth).toBe(1);
  });

  it("take hands back the enqueued record's fields (FIFO)", () => {
    const queue = createSendQueue();
    queue.enqueue(BYTES, "FIRST", 1000);
    queue.enqueue(BYTES, "SECOND", 2000);
    expect(queue.depth).toBe(2);

    const first = queue.take();
    expect(first?.requestControlId).toBe("FIRST");
    expect(first?.timeoutMs).toBe(1000);
    expect(first?.framed).toBe(BYTES);
    expect(queue.depth).toBe(1);

    const second = queue.take();
    expect(second?.requestControlId).toBe("SECOND");
    expect(queue.depth).toBe(0);
    expect(queue.take()).toBeUndefined();
  });

  it("resolving a taken record settles the promise enqueue returned", async () => {
    const queue = createSendQueue();
    const promise = queue.enqueue(BYTES, "MSG1", 1000);
    const task = queue.take();
    task?.resolve(fakeResponse("AA"));
    await expect(promise).resolves.toMatchObject({ code: "AA" });
  });

  it("rejecting a taken record rejects the promise enqueue returned", async () => {
    const queue = createSendQueue();
    const promise = queue.enqueue(BYTES, "MSG1", 1000);
    const task = queue.take();
    task?.reject(new MllpClientError(MllpErrorCode.DROPPED, "gone"));
    await expect(promise).rejects.toMatchObject({
      code: MllpErrorCode.DROPPED,
    });
  });

  it("failAll rejects every waiting send and empties the buffer", async () => {
    const queue = createSendQueue();
    const p1 = queue.enqueue(BYTES, "A", 1000);
    const p2 = queue.enqueue(BYTES, "B", 1000);
    const p3 = queue.enqueue(BYTES, "C", 1000);
    expect(queue.depth).toBe(3);

    queue.failAll(new MllpClientError(MllpErrorCode.CLOSED, "closed"));

    expect(queue.depth).toBe(0);
    for (const p of [p1, p2, p3]) {
      await expect(p).rejects.toMatchObject({ code: MllpErrorCode.CLOSED });
    }
  });

  it("failAll does not touch an already-taken (in-flight) send", async () => {
    // Mirrors the disposition split: the in-flight send (taken for the wire) is
    // settled by the connection, NOT by failAll. failAll only fails what is
    // still buffered.
    const queue = createSendQueue();
    const inFlight = queue.enqueue(BYTES, "INFLIGHT", 1000);
    const queued = queue.enqueue(BYTES, "QUEUED", 1000);

    const task = queue.take(); // simulate dispatch to the wire
    queue.failAll(new MllpClientError(MllpErrorCode.CLOSED, "closed"));

    // The queued one was failed CLOSED…
    await expect(queued).rejects.toMatchObject({ code: MllpErrorCode.CLOSED });
    // …but the taken one is untouched; the "connection" settles it.
    task?.resolve(fakeResponse("AA"));
    await expect(inFlight).resolves.toMatchObject({ code: "AA" });
  });

  it("failAll on an empty queue is a no-op", () => {
    const queue = createSendQueue();
    expect(() =>
      queue.failAll(new MllpClientError(MllpErrorCode.CLOSED, "x"))
    ).not.toThrow();
    expect(queue.depth).toBe(0);
  });
});
