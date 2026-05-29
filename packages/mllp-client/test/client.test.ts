/**
 * Tests for `MllpClient`.
 *
 * All tests use the in-memory fake duplex from `./fake-duplex.ts` —
 * no real sockets, no timing dependence on real I/O. The Node adapter
 * is verified separately (in `node.test.ts` if/when we add live-socket
 * tests; for v0 the fake duplex is sufficient to enforce the contract).
 */

import {
  AckApplicationError,
  AckApplicationReject,
  AckCommitError,
  AckCommitReject,
  AckException,
} from "@glion/ack";
import { frame } from "@glion/mllp-transport";
import { describe, expect, it } from "vitest";

import {
  MllpClient,
  MllpClientError,
  MllpConnectError,
  MllpCorrelationError,
  MllpDroppedError,
  MllpErrorCode,
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

/** Yield to the event loop for the given number of ms. */
function sleep(ms: number): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- canonical sleep helper
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
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

const NAK_CASES = [
  { ack: ACK_AE, code: "AE", errorClass: AckApplicationError },
  { ack: ACK_AR, code: "AR", errorClass: AckApplicationReject },
  { ack: ACK_CE, code: "CE", errorClass: AckCommitError },
  { ack: ACK_CR, code: "CR", errorClass: AckCommitReject },
] as const;

describe("send() — NAK codes", () => {
  it.each(NAK_CASES)(
    "throws the $code AckException subclass",
    async ({ ack, code, errorClass }) => {
      const fake = createFakeDuplex({ onWrite: respondWith(ack) });
      const client = makeClient(fake);
      await client.connect();
      try {
        await client.send(REQUEST);
        expect.fail("send should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AckException);
        expect(error).toBeInstanceOf(errorClass);
        const rej = error as AckException;
        expect(rej.code).toBe(code);
        expect(rej.controlId).toBe(REQUEST_CONTROL_ID);
        expect(rej.tree).toBeDefined();
        expect(typeof rej.raw).toBe("string");
      }
      expect(client.state).toBe("ready");
    }
  );

  it("reads errorCode/severity and the AST from the ERR segment", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AE_WITH_ERR) });
    const client = makeClient(fake);
    await client.connect();
    try {
      await client.send(REQUEST);
      expect.fail("send should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AckApplicationError);
      const rej = error as AckException;
      expect(rej.errorCode).toBe("204");
      expect(rej.severity).toBe("E");
      expect(rej.tree?.children.length).toBeGreaterThan(1);
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

  it("rejects pending send with MllpClientError(CLOSED) on close() during send", async () => {
    const fake = createFakeDuplex({ onWrite: () => {} });
    const client = makeClient(fake);
    await client.connect();
    const p = client.send(REQUEST);
    setTimeout(() => void client.close(), 10);
    await expect(p).rejects.toMatchObject({
      code: MllpErrorCode.CLOSED,
    });
    await expect(p).rejects.toBeInstanceOf(MllpClientError);
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
  it("rejects with MllpDroppedError(write-failed) when the duplex write fails", async () => {
    const fake = createFakeDuplex({ writeError: new Error("EPIPE") });
    const client = makeClient(fake);
    await client.connect();
    let captured: unknown;
    try {
      await client.send(REQUEST);
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(MllpDroppedError);
    expect((captured as MllpDroppedError).reason).toBe("write-failed");
    expect((captured as MllpDroppedError).cause).toBeDefined();
    // Write failure is terminal — connection is closed, not "ready".
    expect(client.state).toBe("closed");
  });
});

// ---------------------------------------------------------------------------
// Stream-level errors propagating from the read loop
// ---------------------------------------------------------------------------

describe("send() — peer sends unframed garbage", () => {
  it("rejects with MllpDroppedError(framing-error) and transitions to closed", async () => {
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => {
        // No VT prefix — decoder will report MISSING_START_BLOCK.
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
    expect(captured).toBeInstanceOf(MllpDroppedError);
    expect((captured as MllpDroppedError).reason).toBe("framing-error");
    expect((captured as MllpDroppedError).cause).toBeDefined();
    // Stream-level error is terminal — subsequent sends fail fast.
    expect(client.state).toBe("closed");
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

// ---------------------------------------------------------------------------
// Round-3 contracts: stream errors are terminal
// ---------------------------------------------------------------------------

describe("send() — stream errors are terminal", () => {
  it("framing error closes the connection (subsequent sends throw CLOSED)", async () => {
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => {
        peer.injectPeerBytes(new Uint8Array([0x41]));
      },
    });
    const client = makeClient(fake);
    await client.connect();
    await expect(client.send(REQUEST)).rejects.toBeInstanceOf(MllpDroppedError);
    expect(client.state).toBe("closed");
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.CLOSED,
    });
  });

  it("write failure closes the connection (subsequent sends throw CLOSED)", async () => {
    const fake = createFakeDuplex({ writeError: new Error("EPIPE") });
    const client = makeClient(fake);
    await client.connect();
    await expect(client.send(REQUEST)).rejects.toBeInstanceOf(MllpDroppedError);
    expect(client.state).toBe("closed");
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.CLOSED,
    });
  });
});

describe("frame-queue overflow protection", () => {
  it("closes the connection when the peer floods unsolicited frames", async () => {
    // Don't emit a useful first ACK — the first send times out, then
    // we inject the overflow flood as a discrete event. This avoids
    // the race where the flood + the legit ACK arrive in one decoder
    // pass and the overflow's pendingError races the legit send's
    // resolution.
    let peerRef: FakeDuplex | null = null;
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => {
        peerRef = peer;
      },
    });
    const client = makeClient(fake);
    await client.connect();
    // Flood the peer with frames the client never asked for.
    const single = frame(ACK_AA);
    const coalesced = new Uint8Array(single.length * 32);
    for (let i = 0; i < 32; i++) {
      coalesced.set(single, i * single.length);
    }
    // Without a send pending, inject the flood. The read loop processes
    // it, queue overflows, state → closed.
    await client.send(REQUEST, { timeoutMs: 30 }).catch(() => {
      // First send times out (peer didn't respond).
    });
    expect(client.state).toBe("ready");
    peerRef!.injectPeerBytes(coalesced);
    // Yield for the read loop to drain the chunk.
    await sleep(10);
    expect(client.state).toBe("closed");
  });
});

describe("decoder reset on SEND_TIMEOUT (slowloris recovery)", () => {
  it("clears mid-frame buffer so a subsequent send is not corrupted", async () => {
    // First call: trickle in just VT — partial frame, will time out.
    // Second call: peer responds correctly with a full ACK.
    let callCount = 0;
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => {
        callCount += 1;
        if (callCount === 1) {
          // Trickle VT only — leaves the decoder with a partial frame.
          peer.injectPeerBytes(new Uint8Array([0x0b]));
        } else {
          peer.injectPeerBytes(frame(ACK_AA));
        }
      },
    });
    const client = makeClient(fake);
    await client.connect();
    await expect(
      client.send(REQUEST, { timeoutMs: 20 })
    ).rejects.toBeInstanceOf(MllpTimeoutError);
    // If the decoder retained the dangling VT, the next send's ACK
    // would land into the corrupted buffer and the test would fail
    // (likely with FramingError). With the reset, the second send
    // gets a clean response.
    const response = await client.send(REQUEST);
    expect(response.code).toBe("AA");
  });
});

// ---------------------------------------------------------------------------
// Round-3 getters: host / port for error logs
// ---------------------------------------------------------------------------

describe("MllpClient — observability getters", () => {
  it("exposes host and port", () => {
    const fake = createFakeDuplex();
    const client = new MllpClient({
      connect: () => Promise.resolve(fake.duplex),
      host: "hospital.example",
      port: 2575,
    });
    expect(client.host).toBe("hospital.example");
    expect(client.port).toBe(2575);
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
