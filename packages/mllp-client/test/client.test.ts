/**
 * Tests for `MllpClient`.
 *
 * All tests use the in-memory fake duplex from `./fake-duplex.ts` —
 * no real sockets, no timing dependence on real I/O. The Node adapter
 * is verified separately (in `node.test.ts` if/when we add live-socket
 * tests; for v0 the fake duplex is sufficient to enforce the contract).
 */

import { frame } from "@glion/mllp-transport";
import { describe, expect, it } from "vitest";

import {
  AckCode,
  MllpClient,
  MllpClientError,
  MllpDroppedError,
  MllpConnectError,
  MllpCorrelationError,
  MllpErrorCode,
  MllpRejectedError,
  MllpTimeoutError,
} from "../src/index";
import type { MllpClient as MllpClientType, MllpDuplex } from "../src/index";
import { createFakeDuplex } from "./fake-duplex";
import type { FakeDuplex } from "./fake-duplex";
import {
  ACK_AA,
  ACK_AA_EMPTY_CONTROL,
  ACK_AA_WRONG_CONTROL,
  ACK_AE,
  ACK_AE_WITH_ERR,
  ACK_AR,
  ACK_CA,
  ACK_CE,
  ACK_CR,
  ACK_EMPTY_CODE,
  ACK_NO_MSA,
  ACK_UNKNOWN_CODE,
  REQUEST,
  REQUEST_CONTROL_ID,
} from "./fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(
  fake: FakeDuplex,
  overrides: { connectTimeoutMs?: number; sendTimeoutMs?: number } = {}
): MllpClientType {
  return new MllpClient({
    connect: () => Promise.resolve(fake.duplex),
    host: "test",
    port: 0,
    ...overrides,
  });
}

function respondWith(
  message: string
): (_chunk: Uint8Array, fake: FakeDuplex) => void {
  return (_chunk, fake) => {
    fake.injectPeerBytes(frame(message));
  };
}

/** Adapter that never connects; rejects only when its signal aborts. */
function abortableConnect(signal: AbortSignal): Promise<MllpDuplex> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping signal
  return new Promise<MllpDuplex>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), {
      once: true,
    });
  });
}

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------

describe("AckCode constants", () => {
  it("exports the six standard codes", () => {
    expect(AckCode).toEqual({
      AA: "AA",
      AE: "AE",
      AR: "AR",
      CA: "CA",
      CE: "CE",
      CR: "CR",
    });
  });
});

// ---------------------------------------------------------------------------
// connect()
// ---------------------------------------------------------------------------

describe("connect()", () => {
  it("transitions idle → connecting → ready on success", async () => {
    const fake = createFakeDuplex();
    const client = makeClient(fake);
    expect(client.state).toBe("idle");
    const p = client.connect();
    expect(client.state).toBe("connecting");
    await p;
    expect(client.state).toBe("ready");
  });

  it("throws ALREADY_CONNECTED on a second connect()", async () => {
    const fake = createFakeDuplex();
    const client = makeClient(fake);
    await client.connect();
    await expect(client.connect()).rejects.toMatchObject({
      code: MllpErrorCode.ALREADY_CONNECTED,
    });
  });

  it("throws MllpConnectError when the adapter rejects", async () => {
    const original = new Error("ECONNREFUSED");
    const client = new MllpClient({
      connect: () => Promise.reject(original),
      host: "x",
      port: 1,
    });
    await expect(client.connect()).rejects.toBeInstanceOf(MllpConnectError);
    expect(client.state).toBe("closed");
  });

  it("throws MllpTimeoutError when the adapter exceeds connectTimeoutMs", async () => {
    const client = new MllpClient({
      connect: ({ signal }) => abortableConnect(signal),
      connectTimeoutMs: 10,
      host: "x",
      port: 1,
    });
    await expect(client.connect()).rejects.toBeInstanceOf(MllpTimeoutError);
    expect(client.state).toBe("closed");
  });

  it("respects a caller-provided abort signal", async () => {
    const ac = new AbortController();
    const client = new MllpClient({
      connect: ({ signal }) => abortableConnect(signal),
      host: "x",
      port: 1,
    });
    const p = client.connect({ signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({
      code: MllpErrorCode.CONNECT_ABORTED,
    });
  });
});

// ---------------------------------------------------------------------------
// send() — happy path
// ---------------------------------------------------------------------------

describe("send() — accept codes", () => {
  it("returns MllpClientResponse on AA", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AA) });
    const client = makeClient(fake);
    await client.connect();
    const response = await client.send(REQUEST);
    expect(response.code).toBe("AA");
    expect(response.controlId).toBe(REQUEST_CONTROL_ID);
    expect(response.tree).toBeDefined();
    expect(response.raw).toBeInstanceOf(Uint8Array);
    expect(response.timestamp).toBeInstanceOf(Date);
    expect(response.durationMs).toBeGreaterThanOrEqual(0);
    expect(client.state).toBe("ready");
  });

  it("returns MllpClientResponse on CA", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_CA) });
    const client = makeClient(fake);
    await client.connect();
    const response = await client.send(REQUEST);
    expect(response.code).toBe("CA");
  });

  it("frames the outgoing message via mllp-transport", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AA) });
    const client = makeClient(fake);
    await client.connect();
    await client.send(REQUEST);
    const written = fake.capturedWrites();
    expect(written[0]).toBe(0x0b);
    expect(written.at(-2)).toBe(0x1c);
    expect(written.at(-1)).toBe(0x0d);
  });

  it("accepts Uint8Array message input", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AA) });
    const client = makeClient(fake);
    await client.connect();
    const bytes = new TextEncoder().encode(REQUEST);
    const response = await client.send(bytes);
    expect(response.code).toBe("AA");
  });

  it("populates response.raw with the de-framed ACK bytes", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AA) });
    const client = makeClient(fake);
    await client.connect();
    const response = await client.send(REQUEST);
    const text = new TextDecoder().decode(response.raw);
    expect(text).toBe(ACK_AA);
  });

  it("accepts an empty MSA-2 (peer doesn't echo controlId)", async () => {
    const fake = createFakeDuplex({
      onWrite: respondWith(ACK_AA_EMPTY_CONTROL),
    });
    const client = makeClient(fake);
    await client.connect();
    const response = await client.send(REQUEST);
    expect(response.code).toBe("AA");
    expect(response.controlId).toBe("");
  });
});

// ---------------------------------------------------------------------------
// send() — NAKs
// ---------------------------------------------------------------------------

describe("send() — NAK codes", () => {
  it.each([
    ["AE", ACK_AE],
    ["AR", ACK_AR],
    ["CE", ACK_CE],
    ["CR", ACK_CR],
  ])("throws MllpRejectedError on %s", async (code, ack) => {
    const fake = createFakeDuplex({ onWrite: respondWith(ack) });
    const client = makeClient(fake);
    await client.connect();
    try {
      await client.send(REQUEST);
      expect.fail("send should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MllpRejectedError);
      const rej = error as MllpRejectedError;
      expect(rej.code).toBe(code);
      expect(rej.controlId).toBe(REQUEST_CONTROL_ID);
      expect(rej.tree).toBeDefined();
      expect(rej.raw).toBeInstanceOf(Uint8Array);
      expect(rej.timestamp).toBeInstanceOf(Date);
      expect(rej.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(client.state).toBe("ready");
  });

  it("carries the AST so callers can walk ERR segments", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AE_WITH_ERR) });
    const client = makeClient(fake);
    await client.connect();
    try {
      await client.send(REQUEST);
      expect.fail("send should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MllpRejectedError);
      const rej = error as MllpRejectedError;
      expect(rej.tree.children.length).toBeGreaterThan(1);
    }
  });
});

// ---------------------------------------------------------------------------
// send() — correlation
// ---------------------------------------------------------------------------

describe("send() — correlation verification", () => {
  it("throws MllpCorrelationError when MSA-2 mismatches MSH-10", async () => {
    const fake = createFakeDuplex({
      onWrite: respondWith(ACK_AA_WRONG_CONTROL),
    });
    const client = makeClient(fake);
    await client.connect();
    try {
      await client.send(REQUEST);
      expect.fail("send should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MllpCorrelationError);
      const corr = error as MllpCorrelationError;
      expect(corr.expected).toBe(REQUEST_CONTROL_ID);
      expect(corr.actual).toBe("OTHER");
    }
  });

  it("does not check correlation when the request has no MSH-10", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AA) });
    const client = makeClient(fake);
    await client.connect();
    // Request without MSH-10 — must be a valid HL7v2-ish line with no
    // VT/FS bytes; we don't pre-parse the request beyond the MSH scan.
    const noControl = "MSH|^~\\&|S|F|R|RF|20240101||ADT^A01|";
    const response = await client.send(noControl);
    expect(response.code).toBe("AA");
  });
});

// ---------------------------------------------------------------------------
// send() — malformed responses
// ---------------------------------------------------------------------------

describe("send() — malformed ACK responses", () => {
  it("throws PARSE_FAILED when the ACK has no MSA segment", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_NO_MSA) });
    const client = makeClient(fake);
    await client.connect();
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.PARSE_FAILED,
    });
  });

  it("throws PARSE_FAILED when MSA-1 is empty", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_EMPTY_CODE) });
    const client = makeClient(fake);
    await client.connect();
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.PARSE_FAILED,
    });
  });

  it("throws UNKNOWN_ACK_CODE when MSA-1 is not standard", async () => {
    const fake = createFakeDuplex({
      onWrite: respondWith(ACK_UNKNOWN_CODE),
    });
    const client = makeClient(fake);
    await client.connect();
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.UNKNOWN_ACK_CODE,
    });
  });
});

// ---------------------------------------------------------------------------
// send() — state guards
// ---------------------------------------------------------------------------

describe("send() — state guards", () => {
  it("throws NOT_CONNECTED when called before connect", async () => {
    const fake = createFakeDuplex();
    const client = makeClient(fake);
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.NOT_CONNECTED,
    });
  });

  it("throws CLOSED when called after close", async () => {
    const fake = createFakeDuplex();
    const client = makeClient(fake);
    await client.connect();
    await client.close();
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.CLOSED,
    });
  });

  it("throws CONCURRENT_SEND when a send is already in flight", async () => {
    // Don't respond — leave the first send pending.
    const fake = createFakeDuplex({ onWrite: () => {} });
    const client = makeClient(fake);
    await client.connect();
    const first = client.send(REQUEST);
    // Let microtasks run so first send transitions to "sending" and writes
    await Promise.resolve();
    await Promise.resolve();
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.CONCURRENT_SEND,
    });
    // Cleanup: drop the peer so the first send rejects, not hang
    fake.closePeer();
    await expect(first).rejects.toBeInstanceOf(MllpDroppedError);
  });

  it("throws EMBEDDED_CONTROL_CHAR via mllp-transport on invalid bytes", async () => {
    const fake = createFakeDuplex();
    const client = makeClient(fake);
    await client.connect();
    // VT in the payload — validate() should reject before we touch state
    const bad = "MSH|^~\\&|\u000Bbad";
    await expect(client.send(bad)).rejects.toMatchObject({
      name: "FramingError",
    });
    expect(client.state).toBe("ready");
  });
});

// ---------------------------------------------------------------------------
// send() — timeouts, abort, drop
// ---------------------------------------------------------------------------

describe("send() — timeout / abort / drop", () => {
  it("throws MllpTimeoutError when no ACK arrives in time", async () => {
    const fake = createFakeDuplex({ onWrite: () => {} });
    const client = makeClient(fake);
    await client.connect();
    try {
      await client.send(REQUEST, { timeoutMs: 20 });
      expect.fail("send should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MllpTimeoutError);
      expect((error as MllpTimeoutError).timeoutMs).toBe(20);
    }
    expect(client.state).toBe("ready");
  });

  it("respects a caller-provided abort signal", async () => {
    const fake = createFakeDuplex({ onWrite: () => {} });
    const client = makeClient(fake);
    await client.connect();
    const ac = new AbortController();
    const p = client.send(REQUEST, { signal: ac.signal });
    setTimeout(() => ac.abort(), 10);
    await expect(p).rejects.toMatchObject({
      code: MllpErrorCode.SEND_ABORTED,
    });
    expect(client.state).toBe("ready");
  });

  it("rejects pending send with MllpDroppedError when peer drops", async () => {
    const fake = createFakeDuplex({ onWrite: () => {} });
    const client = makeClient(fake);
    await client.connect();
    const p = client.send(REQUEST);
    setTimeout(() => fake.closePeer(), 10);
    await expect(p).rejects.toBeInstanceOf(MllpDroppedError);
    expect(client.state).toBe("closed");
  });

  it("rejects pending send with MllpDroppedError on close() during send", async () => {
    const fake = createFakeDuplex({ onWrite: () => {} });
    const client = makeClient(fake);
    await client.connect();
    const p = client.send(REQUEST);
    setTimeout(() => void client.close(), 10);
    await expect(p).rejects.toBeInstanceOf(MllpDroppedError);
    expect(client.state).toBe("closed");
  });
});

// ---------------------------------------------------------------------------
// close()
// ---------------------------------------------------------------------------

describe("close()", () => {
  it("transitions ready → closed", async () => {
    const fake = createFakeDuplex();
    const client = makeClient(fake);
    await client.connect();
    await client.close();
    expect(client.state).toBe("closed");
  });

  it("is idempotent", async () => {
    const fake = createFakeDuplex();
    const client = makeClient(fake);
    await client.connect();
    await client.close();
    await client.close();
    await client.close();
    expect(client.state).toBe("closed");
    expect(fake.closeCount()).toBe(1);
  });

  it("transitions idle → closed without invoking the adapter", async () => {
    const fake = createFakeDuplex();
    const client = makeClient(fake);
    await client.close();
    expect(client.state).toBe("closed");
    expect(fake.closeCount()).toBe(0);
  });

  it("can be invoked via Symbol.asyncDispose", async () => {
    const fake = createFakeDuplex();
    {
      await using client = makeClient(fake);
      await client.connect();
      expect(client.state).toBe("ready");
    }
    // After the `using` block, close has been called.
    expect(fake.closeCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Drop detection
// ---------------------------------------------------------------------------

describe("peer drop detection", () => {
  it("transitions ready → closed when the peer drops idle", async () => {
    const fake = createFakeDuplex();
    const client = makeClient(fake);
    await client.connect();
    expect(client.state).toBe("ready");
    fake.closePeer();
    // Wait for the watcher microtask
    await Promise.resolve();
    await Promise.resolve();
    expect(client.state).toBe("closed");
  });

  it("rejects subsequent sends with CLOSED after a drop", async () => {
    const fake = createFakeDuplex();
    const client = makeClient(fake);
    await client.connect();
    fake.closePeer();
    await Promise.resolve();
    await Promise.resolve();
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.CLOSED,
    });
  });
});

// ---------------------------------------------------------------------------
// Frame-decoder integration: multi-chunk ACK
// ---------------------------------------------------------------------------

describe("multi-chunk ACK", () => {
  it("decodes an ACK delivered as multiple peer chunks", async () => {
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => {
        const framed = frame(ACK_AA);
        const mid = Math.floor(framed.length / 2);
        peer.injectPeerBytes(framed.subarray(0, mid));
        peer.injectPeerBytes(framed.subarray(mid));
      },
    });
    const client = makeClient(fake);
    await client.connect();
    const response = await client.send(REQUEST);
    expect(response.code).toBe("AA");
  });
});

// ---------------------------------------------------------------------------
// Connection persistence — verifies that one connection survives many sends
// (regression: an earlier implementation called reader.cancel() between
// sends, which destroys the underlying stream on real adapters).
// ---------------------------------------------------------------------------

describe("multiple sends on one connection", () => {
  it("does three back-to-back sends without reconnecting", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AA) });
    const client = makeClient(fake);
    await client.connect();
    const r1 = await client.send(REQUEST);
    const r2 = await client.send(REQUEST);
    const r3 = await client.send(REQUEST);
    expect(r1.code).toBe("AA");
    expect(r2.code).toBe("AA");
    expect(r3.code).toBe("AA");
    expect(client.state).toBe("ready");
  });

  it("decodes coalesced peer frames (two ACKs in one chunk) across two sends", async () => {
    // Peer pipelines two ACKs in one write — the second is queued by the
    // persistent decoder and consumed by the second send.
    let sendCount = 0;
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => {
        sendCount += 1;
        if (sendCount === 1) {
          // First write: peer sends BOTH ACKs coalesced.
          const a = frame(ACK_AA);
          const b = frame(ACK_AA);
          const coalesced = new Uint8Array(a.length + b.length);
          coalesced.set(a, 0);
          coalesced.set(b, a.length);
          peer.injectPeerBytes(coalesced);
        }
        // Second write: peer is silent — we consume the queued frame.
      },
    });
    const client = makeClient(fake);
    await client.connect();
    const r1 = await client.send(REQUEST);
    const r2 = await client.send(REQUEST);
    expect(r1.code).toBe("AA");
    expect(r2.code).toBe("AA");
  });
});

// ---------------------------------------------------------------------------
// Write failure
// ---------------------------------------------------------------------------

describe("send() — write failure", () => {
  it("rejects with WRITE_FAILED when the duplex write fails", async () => {
    const fake = createFakeDuplex({ writeError: new Error("EPIPE") });
    const client = makeClient(fake);
    await client.connect();
    let captured: unknown;
    try {
      await client.send(REQUEST);
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(MllpClientError);
    expect((captured as MllpClientError).code).toBe(MllpErrorCode.WRITE_FAILED);
    expect((captured as MllpClientError).cause).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Stream-level errors propagating from the read loop
// ---------------------------------------------------------------------------

describe("send() — peer sends unframed garbage", () => {
  it("rejects the in-flight send with a FramingError from the decoder", async () => {
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => {
        // No VT prefix — decoder will throw MISSING_START_BLOCK.
        peer.injectPeerBytes(new Uint8Array([0x41, 0x42, 0x43]));
      },
    });
    const client = makeClient(fake);
    await client.connect();
    let captured: unknown;
    try {
      await client.send(REQUEST);
    } catch (error) {
      captured = error;
    }
    expect((captured as Error).name).toBe("FramingError");
  });
});

describe("send() — parseHL7v2 throws on the ACK bytes", () => {
  it("rejects with PARSE_FAILED carrying the underlying cause", async () => {
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => {
        peer.injectPeerBytes(frame("GARBAGE WITHOUT MSH SEGMENT"));
      },
    });
    const client = makeClient(fake);
    await client.connect();
    let captured: unknown;
    try {
      await client.send(REQUEST);
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(MllpClientError);
    expect((captured as MllpClientError).code).toBe(MllpErrorCode.PARSE_FAILED);
  });
});

// ---------------------------------------------------------------------------
// Out-of-band late ACK — the headline scenario the persistent decoder
// + correlation check exists to handle.
// ---------------------------------------------------------------------------

describe("send() — late ACK from previously-timed-out send", () => {
  it("late ACK lands on the next send and trips correlation", async () => {
    let firstWrite = true;
    let peerRef: FakeDuplex | null = null;
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => {
        peerRef = peer;
        if (firstWrite) {
          firstWrite = false;
          // First send: peer never responds (will time out).
          return;
        }
        // Second send: peer responds, BUT the late ACK from send #1
        // is already queued ahead of it.
        peer.injectPeerBytes(frame(requestAck("AA", "MSG_SECOND")));
      },
    });
    const client = makeClient(fake);
    await client.connect();

    // First send times out.
    await expect(
      client.send(requestWithControlId("MSG_FIRST"), { timeoutMs: 20 })
    ).rejects.toBeInstanceOf(MllpTimeoutError);
    expect(client.state).toBe("ready");

    // Late ACK for the timed-out request arrives between sends.
    peerRef!.injectPeerBytes(frame(requestAck("AA", "MSG_FIRST")));
    // Yield to the read loop so the late frame reaches #pendingFrames
    // before the next send registers its waiter. Without this the test
    // depends on undocumented microtask ordering inside send().
    await Promise.resolve();
    await Promise.resolve();

    // Second send picks up the queued late ACK first — controlId
    // mismatch (expected MSG_SECOND, actual MSG_FIRST).
    let captured: unknown;
    try {
      await client.send(requestWithControlId("MSG_SECOND"));
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(MllpCorrelationError);
    expect((captured as MllpCorrelationError).expected).toBe("MSG_SECOND");
    expect((captured as MllpCorrelationError).actual).toBe("MSG_FIRST");
  });
});

function requestWithControlId(controlId: string): string {
  return [
    `MSH|^~\\&|SENDER|FAC|RECV|RFAC|20241201120000||ADT^A01^ADT_A01|${controlId}|P|2.5`,
    "PID|1||12345^^^MRN||Doe^John",
  ].join("\r");
}

function requestAck(code: string, controlId: string): string {
  return [
    "MSH|^~\\&|RECV|RFAC|SENDER|FAC|20241201120001||ACK^A01^ACK|ACK001|P|2.5",
    `MSA|${code}|${controlId}`,
  ].join("\r");
}
