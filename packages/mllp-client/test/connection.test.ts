/**
 * Tests for the per-connection wire (`createConnection`).
 *
 * These drive the {@link Connection} factory DIRECTLY — building it over the
 * in-memory fake duplex and calling `exchange()` / `shutdown()` — rather than
 * through `MllpClient`. The connection owns everything whose correct lifetime
 * is a single connection: the persistent frame decoder, the read loop,
 * peer-drop detection, the single-flight ACK exchange (write → await frame →
 * parse + stamp timing), the unsolicited-frame buffer, and the single-latched
 * teardown that fires `onDrop` at most once. State-machine reactions to those
 * events (idle → connected → closed) belong to the client and are pinned in
 * `client.test.ts`; the cleaning of outbound messages also belongs to the
 * client — the connection writes the framed bytes it is handed, verbatim.
 */

import { AckApplicationReject } from "@glion/ack";
import { frame } from "@glion/mllp-codec";
import { parseHL7v2 } from "@glion/parser";
import { encodeBytes } from "@glion/util-charset";
import { describe, expect, it } from "vitest";

import { createConnection } from "../src/connection";
import type { Connection, ExchangeRequest } from "../src/connection";
import { MllpClientError, MllpErrorCode } from "../src/errors";
import { createFakeDuplex } from "./fake-duplex";
import type { FakeDuplex } from "./fake-duplex";
import {
  ACK_AA,
  ACK_AR,
  ACK_NO_MSA,
  REQUEST,
  REQUEST_CONTROL_ID,
} from "./fixtures";

/** UTF-8 encode + frame — the wire form of a text fixture. */
function frameText(text: string): Uint8Array {
  return frame(encodeBytes(text));
}

const HOST = "test";
const PORT = 0;

function setup(
  fake: FakeDuplex,
  opts: { maxBufferedBytes?: number } = {}
): { conn: Connection; drops: MllpClientError[] } {
  const drops: MllpClientError[] = [];
  const conn = createConnection({
    duplex: fake.duplex,
    host: HOST,
    maxBufferedBytes: opts.maxBufferedBytes,
    onDrop: (error) => drops.push(error),
    parser: parseHL7v2,
    port: PORT,
  });
  return { conn, drops };
}

/** Build an `ExchangeRequest` from a message; the framing the client does. */
function exchangeRequest(
  message: string = REQUEST,
  controlId: string = REQUEST_CONTROL_ID,
  timeoutMs = 1000
): ExchangeRequest {
  return { framed: frameText(message), requestControlId: controlId, timeoutMs };
}

function respondWith(
  message: string
): (_chunk: Uint8Array, fake: FakeDuplex) => void {
  return (_chunk, fake) => fake.injectPeerBytes(frameText(message));
}

/** Await a rejection and return the error for multi-field assertions. */
async function rejection(promise: Promise<unknown>): Promise<MllpClientError> {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof MllpClientError)) {
      throw new Error(`expected MllpClientError, got ${String(error)}`, {
        cause: error,
      });
    }
    return error;
  }
  throw new Error("expected the exchange to reject, but it resolved");
}

/** Yield to the event loop for the given number of ms. */
function sleep(ms: number): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- canonical sleep helper
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

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

// ---------------------------------------------------------------------------
// exchange() — the single round trip
// ---------------------------------------------------------------------------

describe("exchange() — round trip", () => {
  it("resolves with the parsed ACK and the wire timing it measured", async () => {
    // parseResponse owns the parsed fields; the connection's contribution is the
    // wire timing (timestamp + durationMs) it stamps on top.
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AA) });
    const { conn } = setup(fake);
    const response = await conn.exchange(exchangeRequest());
    expect(response.code).toBe("AA");
    expect(response.controlId).toBe(REQUEST_CONTROL_ID);
    expect(response.raw).toBe(ACK_AA);
    expect(response.tree).toBeDefined();
    expect(response.timestamp).toBeInstanceOf(Date);
    expect(response.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("writes the framed request to the duplex verbatim (no cleaning here)", async () => {
    // The connection is a byte-faithful relay of the bytes it is handed —
    // parse/clean is the client's job, one layer up.
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AA) });
    const { conn } = setup(fake);
    const req = exchangeRequest();
    await conn.exchange(req);
    expect(fake.capturedWrites()).toEqual(req.framed);
  });

  it("propagates the AckException on a NAK (does not swallow parseResponse)", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AR) });
    const { conn } = setup(fake);
    await expect(conn.exchange(exchangeRequest())).rejects.toBeInstanceOf(
      AckApplicationReject
    );
  });

  it("propagates INVALID_RESPONSE when the ACK is unparseable (no MSA)", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_NO_MSA) });
    const { conn } = setup(fake);
    await expect(conn.exchange(exchangeRequest())).rejects.toMatchObject({
      code: MllpErrorCode.INVALID_RESPONSE,
    });
  });
});

// ---------------------------------------------------------------------------
// Decoding across the connection's persistent read loop + frame buffer. The
// decoder buffer survives across exchanges WITHIN a connection (never across
// connections) — that persistence is connection-scoped state.
// ---------------------------------------------------------------------------

describe("exchange() — decoding across the read loop", () => {
  it("decodes an ACK delivered as multiple peer chunks", async () => {
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => {
        const framed = frameText(ACK_AA);
        const mid = Math.floor(framed.length / 2);
        peer.injectPeerBytes(framed.subarray(0, mid));
        peer.injectPeerBytes(framed.subarray(mid));
      },
    });
    const { conn } = setup(fake);
    const response = await conn.exchange(exchangeRequest());
    expect(response.code).toBe("AA");
  });

  it("consumes a second, coalesced ACK on the next exchange", async () => {
    // The peer pipelines two ACKs in one write; the persistent decoder queues
    // the second so the next exchange drains it without a fresh peer write.
    let writes = 0;
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => {
        writes += 1;
        if (writes === 1) {
          const a = frameText(ACK_AA);
          const b = frameText(ACK_AA);
          const coalesced = new Uint8Array(a.length + b.length);
          coalesced.set(a, 0);
          coalesced.set(b, a.length);
          peer.injectPeerBytes(coalesced);
        }
        // Second write: the peer stays silent — we drain the queued frame.
      },
    });
    const { conn } = setup(fake);
    const r1 = await conn.exchange(exchangeRequest());
    const r2 = await conn.exchange(exchangeRequest());
    expect(r1.code).toBe("AA");
    expect(r2.code).toBe("AA");
  });

  it("reuses one connection across many sequential exchanges", async () => {
    // Regression: an earlier design cancelled the reader between sends, which
    // destroys the underlying stream on real adapters. The read loop must
    // persist for the connection's whole lifetime.
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AA) });
    const { conn } = setup(fake);
    const r1 = await conn.exchange(exchangeRequest());
    const r2 = await conn.exchange(exchangeRequest());
    const r3 = await conn.exchange(exchangeRequest());
    expect(r1.code).toBe("AA");
    expect(r2.code).toBe("AA");
    expect(r3.code).toBe("AA");
  });
});

// ---------------------------------------------------------------------------
// Send deadline — owned by exchange(), scoped to one exchange.
// ---------------------------------------------------------------------------

describe("exchange() — send deadline", () => {
  it("rejects with SEND_TIMEOUT when no ACK arrives in time, and drops the connection", async () => {
    const fake = createFakeDuplex({ onWrite: () => {} });
    const { conn, drops } = setup(fake);
    const error = await rejection(
      conn.exchange(exchangeRequest(REQUEST, REQUEST_CONTROL_ID, 20))
    );
    expect(error.code).toBe(MllpErrorCode.SEND_TIMEOUT);
    expect(error.message).toContain("20ms");
    // A timeout is connection-terminal: a late ACK could never be matched
    // safely on this wire again.
    expect(drops).toHaveLength(1);
    expect(drops[0]?.code).toBe(MllpErrorCode.DROPPED);
  });

  it("the deadline covers the write: a remote system that stops reading cannot park the exchange", async () => {
    const fake = createFakeDuplex({
      // oxlint-disable-next-line promise/avoid-new -- a write that never settles
      onWrite: () => new Promise(() => {}),
    });
    const { conn, drops } = setup(fake);
    const error = await rejection(
      conn.exchange(exchangeRequest(REQUEST, REQUEST_CONTROL_ID, 20))
    );
    expect(error.code).toBe(MllpErrorCode.SEND_TIMEOUT);
    expect(drops).toHaveLength(1);
  });

  it("a timeout is terminal: the next exchange on the dropped connection fails", async () => {
    const fake = createFakeDuplex({ onWrite: () => {} });
    const { conn, drops } = setup(fake);
    await expect(
      conn.exchange(exchangeRequest(REQUEST, REQUEST_CONTROL_ID, 20))
    ).rejects.toMatchObject({ code: MllpErrorCode.SEND_TIMEOUT });
    expect(drops).toHaveLength(1);
    const error = await rejection(conn.exchange(exchangeRequest()));
    expect(error.code).toBe(MllpErrorCode.DROPPED);
  });

  it("a stalled partial response cannot poison later sends: the timeout drops the connection", async () => {
    // The remote trickles only the start of MSG_FIRST's ACK and the send
    // times out. The timeout is terminal — the connection drops, so when the
    // rest of that ACK would arrive it lands on a dead wire instead of
    // queueing up to desynchronize the next send's correlation.
    const lateAck = frameText(requestAck("AA", "MSG_FIRST"));
    let writes = 0;
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => {
        writes += 1;
        if (writes === 1) {
          peer.injectPeerBytes(lateAck.subarray(0, 5));
        }
      },
    });
    const { conn, drops } = setup(fake);
    await expect(
      conn.exchange(
        exchangeRequest(requestWithControlId("MSG_FIRST"), "MSG_FIRST", 20)
      )
    ).rejects.toMatchObject({ code: MllpErrorCode.SEND_TIMEOUT });

    expect(drops).toHaveLength(1);

    fake.injectPeerBytes(lateAck.subarray(5)); // the stalled tail arrives on a dead wire
    await sleep(5);

    const error = await rejection(
      conn.exchange(
        exchangeRequest(requestWithControlId("MSG_SECOND"), "MSG_SECOND")
      )
    );
    expect(error.code).toBe(MllpErrorCode.DROPPED);
    expect(drops).toHaveLength(1);
  });

  it("drops the connection when a new response starts inside an unterminated one", async () => {
    // The remote trickles a partial frame and stalls, then starts its NEXT
    // message: the fresh VT inside the unterminated frame is a framing
    // violation — frames can never glue — and the connection is torn down
    // with DROPPED while the exchange is still waiting.
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => {
        peer.injectPeerBytes(new Uint8Array([0x0b, 0x4d])); // VT + stalled partial
        setTimeout(() => {
          peer.injectPeerBytes(frameText(ACK_AA)); // a new frame begins mid-frame
        }, 5);
      },
    });
    const { conn, drops } = setup(fake);
    const error = await rejection(
      conn.exchange(exchangeRequest(REQUEST, REQUEST_CONTROL_ID, 1000))
    );
    expect(error.code).toBe(MllpErrorCode.DROPPED);
    expect(drops).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Late ACK — after a timeout the connection is dropped, so an ACK arriving
// late lands on a dead wire and can never be misattributed to a later send.
// ---------------------------------------------------------------------------

describe("exchange() — late ACK after a timeout", () => {
  it("a late ACK lands on the dropped connection, never on the next exchange", async () => {
    const fake = createFakeDuplex({ onWrite: () => {} });
    const { conn, drops } = setup(fake);

    await expect(
      conn.exchange(
        exchangeRequest(requestWithControlId("MSG_FIRST"), "MSG_FIRST", 20)
      )
    ).rejects.toMatchObject({ code: MllpErrorCode.SEND_TIMEOUT });
    expect(drops).toHaveLength(1);
    expect(drops[0]?.cause).toMatchObject({
      code: MllpErrorCode.SEND_TIMEOUT,
    });

    // The late ACK for the timed-out request arrives after the drop: the
    // wire is closed, so it is discarded rather than queued for the next
    // send.
    fake.injectPeerBytes(frameText(requestAck("AA", "MSG_FIRST")));
    await sleep(5);

    const error = await rejection(
      conn.exchange(
        exchangeRequest(requestWithControlId("MSG_SECOND"), "MSG_SECOND")
      )
    );
    expect(error.code).toBe(MllpErrorCode.DROPPED);
  });
});

// ---------------------------------------------------------------------------
// Peer drop — detected by the read loop / drop watcher. Fires onDrop once and
// rejects the in-flight exchange with DROPPED.
// ---------------------------------------------------------------------------

describe("peer drop", () => {
  it("rejects the in-flight exchange with DROPPED and fires onDrop once", async () => {
    const fake = createFakeDuplex({ onWrite: () => {} });
    const { conn, drops } = setup(fake);
    const inflight = conn.exchange(exchangeRequest());
    setTimeout(() => fake.closePeer(), 10);
    await expect(inflight).rejects.toMatchObject({
      code: MllpErrorCode.DROPPED,
    });
    expect(drops).toHaveLength(1);
    expect(drops[0]?.code).toBe(MllpErrorCode.DROPPED);
  });

  it("fires onDrop once when the peer drops with no exchange in flight", async () => {
    const fake = createFakeDuplex();
    const { drops } = setup(fake);
    fake.closePeer();
    await sleep(5);
    expect(drops).toHaveLength(1);
    expect(drops[0]?.code).toBe(MllpErrorCode.DROPPED);
  });

  it("a one-shot remote that ACKs and closes in the same instant still resolves the exchange", async () => {
    // The closed signal must not outrun the ACK through the wire pipeline's
    // microtask hops — the drop watcher defers one macrotask for exactly this.
    const fake = createFakeDuplex({
      onWrite: (_chunk, f) => {
        f.injectPeerBytes(frameText(ACK_AA));
        f.closePeer();
      },
    });
    const { conn } = setup(fake);
    const response = await conn.exchange(exchangeRequest());
    expect(response.code).toBe("AA");
  });
});

// ---------------------------------------------------------------------------
// Uninterpretable replies are terminal — a stray frame must not be consumed
// as the NEXT send's ACK and desynchronize correlation forever.
// ---------------------------------------------------------------------------

describe("exchange() — an uninterpretable reply drops the connection", () => {
  it("a stray frame queued between sends fails one exchange, then the connection is dropped, never off-by-one", async () => {
    const fake = createFakeDuplex({
      onWrite: (_chunk, f) => {
        f.injectPeerBytes(frameText(ACK_AA));
      },
    });
    const { conn, drops } = setup(fake);
    // An unsolicited frame arrives while no exchange is in flight; it queues.
    fake.injectPeerBytes(frameText(requestAck("AA", "STALE")));
    await sleep(5);
    // The next exchange takes the stale frame as its ACK: correlation fails
    // AND the connection drops — the wire can no longer be trusted.
    const first = await rejection(conn.exchange(exchangeRequest()));
    expect(first.code).toBe(MllpErrorCode.INVALID_RESPONSE);
    expect(drops).toHaveLength(1);
    const second = await rejection(conn.exchange(exchangeRequest()));
    expect(second.code).toBe(MllpErrorCode.DROPPED);
  });

  it("a NAK does not drop the connection (the remote system answered properly)", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AR) });
    const { conn, drops } = setup(fake);
    await expect(conn.exchange(exchangeRequest())).rejects.toBeInstanceOf(
      AckApplicationReject
    );
    expect(drops).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Write failure — terminal: the socket half is dead.
// ---------------------------------------------------------------------------

describe("exchange() — write failure", () => {
  it("rejects with DROPPED, preserves the cause, and tears the wire down", async () => {
    const writeError = new Error("EPIPE");
    const fake = createFakeDuplex({ writeError });
    const { conn, drops } = setup(fake);
    const error = await rejection(conn.exchange(exchangeRequest()));
    expect(error.code).toBe(MllpErrorCode.DROPPED);
    expect(error.cause).toBe(writeError);
    expect(drops).toHaveLength(1);
    expect(fake.closeCount()).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Unframed garbage — a decoder error is terminal (its buffer state becomes
// undefined past that point). This also pins the single-latch contract: the
// read-loop error AND the duplex close it triggers must yield ONE onDrop.
// ---------------------------------------------------------------------------

describe("read loop — framing error", () => {
  it("rejects with DROPPED and fires onDrop exactly once", async () => {
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => {
        // No VT start block — the decoder reports a framing error.
        peer.injectPeerBytes(new Uint8Array([0x41, 0x42, 0x43]));
      },
    });
    const { conn, drops } = setup(fake);
    const error = await rejection(conn.exchange(exchangeRequest()));
    expect(error.code).toBe(MllpErrorCode.DROPPED);
    expect(error.cause).toMatchObject({
      code: "UNEXPECTED_DATA",
      name: "MllpCodecError",
    });
    // The decoder error closes the duplex; the drop watcher must NOT re-fire.
    await sleep(5);
    expect(drops).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Unsolicited-frame flood — a peer that floods frames with nothing waiting is
// capped so it cannot grow memory without bound.
// ---------------------------------------------------------------------------

describe("unsolicited-frame flood", () => {
  it("closes the connection past the buffer cap (16 frames)", async () => {
    const fake = createFakeDuplex();
    const { drops } = setup(fake);
    // 17 unsolicited frames: the buffer holds 16, the 17th overflows.
    const single = frameText(ACK_AA);
    const flood = 17;
    const coalesced = new Uint8Array(single.length * flood);
    for (let i = 0; i < flood; i++) {
      coalesced.set(single, i * single.length);
    }
    fake.injectPeerBytes(coalesced);
    await sleep(5);
    expect(drops).toHaveLength(1);
    expect(drops[0]?.code).toBe(MllpErrorCode.DROPPED);
    expect(drops[0]?.message).toContain("unsolicited");
  });
});

// ---------------------------------------------------------------------------
// shutdown() — owner-initiated teardown. The counterpart to a peer drop: it
// settles the in-flight send with the owner's reason and closes the duplex, but
// does NOT fire onDrop (the owner already knows it is closing).
// ---------------------------------------------------------------------------

describe("shutdown()", () => {
  it("settles the in-flight exchange with the reason and does not fire onDrop", async () => {
    const fake = createFakeDuplex({ onWrite: () => {} });
    const { conn, drops } = setup(fake);
    const inflight = conn.exchange(exchangeRequest());
    const reason = new MllpClientError(MllpErrorCode.CLOSED, "owner closed");
    await conn.shutdown(reason);
    await expect(inflight).rejects.toBe(reason);
    expect(fake.closeCount()).toBeGreaterThanOrEqual(1);
    expect(drops).toHaveLength(0);
  });

  it("resolves and closes the duplex when no exchange is in flight", async () => {
    const fake = createFakeDuplex();
    const { conn, drops } = setup(fake);
    await conn.shutdown(
      new MllpClientError(MllpErrorCode.CLOSED, "owner closed")
    );
    expect(fake.closeCount()).toBe(1);
    expect(drops).toHaveLength(0);
  });

  it("is a no-op after a peer drop already tore the wire down", async () => {
    const fake = createFakeDuplex();
    const { conn, drops } = setup(fake);
    fake.closePeer();
    await sleep(5);
    expect(drops).toHaveLength(1);
    const closesAfterDrop = fake.closeCount();

    await conn.shutdown(
      new MllpClientError(MllpErrorCode.CLOSED, "owner closed")
    );
    // The `dead` latch already won — shutdown adds no second close, no onDrop.
    expect(drops).toHaveLength(1);
    expect(fake.closeCount()).toBe(closesAfterDrop);
  });
});
