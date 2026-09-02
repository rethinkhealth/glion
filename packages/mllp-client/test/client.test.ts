/**
 * Tests for `MllpClient`.
 *
 * All tests use the in-memory fake duplex from `./fake-duplex.ts` —
 * no real sockets, no timing dependence on real I/O. Live-socket behaviour
 * of the Node adapter is verified separately in `node.test.ts`.
 */

import {
  AckApplicationError,
  AckApplicationReject,
  AckCommitError,
  AckCommitReject,
  AckException,
} from "@glion/ack";
import { frame } from "@glion/mllp-codec";
import { parseHL7v2 } from "@glion/parser";
import { CharsetError, encodeBytes } from "@glion/util-charset";
import { value } from "@glion/util-query";
import { describe, expect, it } from "vitest";

import { MllpClient, MllpClientError, MllpErrorCode } from "../src/index";
import type { MllpDuplex, SendInput } from "../src/index";
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

/** UTF-8 encode + frame — the wire form of a text fixture. */
function frameText(text: string): Uint8Array {
  return frame(encodeBytes(text));
}

function makeClient(
  fake: FakeDuplex,
  overrides: { connectTimeoutMs?: number; sendTimeoutMs?: number } = {}
): MllpClient {
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
    fake.injectPeerBytes(frameText(message));
  };
}

/** Yield to the event loop for the given number of ms. */
function sleep(ms: number): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- canonical sleep helper
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Swallow a settlement; used to observe a promise without asserting on it. */
function noop(): void {
  // intentionally empty
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
  it("transitions idle → connecting → connected on success", async () => {
    const fake = createFakeDuplex();
    const client = makeClient(fake);
    expect(client.state).toBe("idle");
    const p = client.connect();
    expect(client.state).toBe("connecting");
    await p;
    expect(client.state).toBe("connected");
  });

  it("is idempotent: connect() on a connected client resolves without a second adapter call", async () => {
    const fake = createFakeDuplex();
    let adapterCalls = 0;
    const client = new MllpClient({
      connect: () => {
        adapterCalls += 1;
        return Promise.resolve(fake.duplex);
      },
      host: "test",
      port: 0,
    });
    await client.connect();
    await client.connect();
    expect(adapterCalls).toBe(1);
    expect(client.state).toBe("connected");
  });

  it("concurrent connect() calls join the one in-flight attempt", async () => {
    const fake = createFakeDuplex();
    let adapterCalls = 0;
    let release: () => void = noop;
    // oxlint-disable-next-line promise/avoid-new -- gate the adapter resolution
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = new MllpClient({
      connect: async () => {
        adapterCalls += 1;
        await gate;
        return fake.duplex;
      },
      host: "test",
      port: 0,
    });

    const first = client.connect();
    const second = client.connect();
    expect(client.state).toBe("connecting");
    release();
    await Promise.all([first, second]);

    expect(adapterCalls).toBe(1);
    expect(client.state).toBe("connected");
  });

  it("joined connect() callers share the failure when close() interrupts", async () => {
    const client = new MllpClient({
      connect: ({ signal }) => abortableConnect(signal),
      host: "x",
      port: 1,
    });
    const first = client.connect();
    const second = client.connect();
    await client.close();

    await expect(first).rejects.toMatchObject({
      code: MllpErrorCode.CONNECT_ABORTED,
    });
    await expect(second).rejects.toMatchObject({
      code: MllpErrorCode.CONNECT_ABORTED,
    });
    expect(client.state).toBe("closed");
  });

  it("throws CLOSED on connect() after close()", async () => {
    const fake = createFakeDuplex();
    const client = makeClient(fake);
    await client.connect();
    await client.close();
    await expect(client.connect()).rejects.toMatchObject({
      code: MllpErrorCode.CLOSED,
    });
  });

  it("throws CLOSED on connect() after peer drop, carrying the drop reason on cause", async () => {
    const fake = createFakeDuplex();
    const client = makeClient(fake);
    await client.connect();
    fake.closePeer();
    // Wait for the drop watcher to transition the client to "closed".
    await sleep(5);
    await expect(client.connect()).rejects.toMatchObject({
      cause: expect.objectContaining({ code: MllpErrorCode.DROPPED }),
      code: MllpErrorCode.CLOSED,
    });
  });

  it("throws CONNECT_FAILED when the adapter rejects", async () => {
    const original = new Error("ECONNREFUSED");
    const client = new MllpClient({
      connect: () => Promise.reject(original),
      host: "x",
      port: 1,
    });
    await expect(client.connect()).rejects.toMatchObject({
      code: MllpErrorCode.CONNECT_FAILED,
    });
    expect(client.state).toBe("closed");
  });

  it("carries the connect failure on later CLOSED errors", async () => {
    const client = new MllpClient({
      connect: () => Promise.reject(new Error("ECONNREFUSED")),
      host: "x",
      port: 1,
    });
    await client.connect().catch(noop);
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      cause: expect.objectContaining({ code: MllpErrorCode.CONNECT_FAILED }),
      code: MllpErrorCode.CLOSED,
    });
  });

  it("throws CONNECT_TIMEOUT when the adapter exceeds connectTimeoutMs", async () => {
    const client = new MllpClient({
      connect: ({ signal }) => abortableConnect(signal),
      connectTimeoutMs: 10,
      host: "x",
      port: 1,
    });
    await expect(client.connect()).rejects.toMatchObject({
      code: MllpErrorCode.CONNECT_TIMEOUT,
    });
    expect(client.state).toBe("closed");
  });

  it("throws CONNECT_ABORTED when close() interrupts an in-flight connect", async () => {
    // A deferred adapter lets close() run while the machine is "connecting".
    // The adapter then resolves with a duplex the client no longer wants — it
    // must close that orphaned socket (no leak) and reject with CONNECT_ABORTED.
    const fake = createFakeDuplex();
    let release: () => void = noop;
    // oxlint-disable-next-line promise/avoid-new -- gate the adapter resolution
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = new MllpClient({
      connect: async () => {
        await gate;
        return fake.duplex;
      },
      host: "x",
      port: 1,
    });

    const connecting = client.connect();
    expect(client.state).toBe("connecting");
    await client.close();
    release();

    await expect(connecting).rejects.toMatchObject({
      code: MllpErrorCode.CONNECT_ABORTED,
    });
    expect(client.state).toBe("closed");
    // The orphaned duplex the adapter returned after close() was torn down.
    expect(fake.closeCount()).toBe(1);
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
    expect(typeof response.raw).toBe("string");
    expect(response.timestamp).toBeInstanceOf(Date);
    expect(response.durationMs).toBeGreaterThanOrEqual(0);
    expect(client.state).toBe("connected");
  });

  it("accepts a Root (parsed tree) as send input", async () => {
    // The other half of SendInput: a caller may pass an already-parsed tree.
    // send() uses it as-is and serializes it for the wire.
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AA) });
    const client = makeClient(fake);
    await client.connect();
    const tree = parseHL7v2(REQUEST);
    const response = await client.send(tree);
    expect(response.code).toBe("AA");
    expect(response.controlId).toBe(REQUEST_CONTROL_ID);
  });

  it("returns MllpClientResponse on CA", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_CA) });
    const client = makeClient(fake);
    await client.connect();
    const response = await client.send(REQUEST);
    expect(response.code).toBe("CA");
  });

  it("frames the outgoing message via mllp-codec", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AA) });
    const client = makeClient(fake);
    await client.connect();
    await client.send(REQUEST);
    const written = fake.capturedWrites();
    expect(written[0]).toBe(0x0b);
    expect(written.at(-2)).toBe(0x1c);
    expect(written.at(-1)).toBe(0x0d);
  });

  it("cleans the message on the wire — a trailing empty field is dropped", async () => {
    // The client is a cleaning client: the message is parsed and re-serialized
    // to canonical HL7v2, so the trailing field delimiter in "PID|1|" is trimmed
    // to "PID|1". (Semantically faithful — the field is absent either way.)
    const request = [
      "MSH|^~\\&|S|F|R|RF|20240101||ADT^A01|MSG001",
      "PID|1|",
    ].join("\r");
    const cleaned = [
      "MSH|^~\\&|S|F|R|RF|20240101||ADT^A01|MSG001",
      "PID|1",
    ].join("\r");
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AA) });
    const client = makeClient(fake);
    await client.connect();
    await client.send(request);
    expect(fake.capturedWrites()).toEqual(frameText(cleaned));
  });

  it("normalizes line endings on the wire (CRLF → CR)", async () => {
    // A CRLF-terminated message is cleaned to canonical CR-delimited HL7v2.
    const request = "MSH|^~\\&|S|F|R|RF|20240101||ADT^A01|MSG001\r\nPID|1||x";
    const cleaned = "MSH|^~\\&|S|F|R|RF|20240101||ADT^A01|MSG001\rPID|1||x";
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AA) });
    const client = makeClient(fake);
    await client.connect();
    await client.send(request);
    expect(fake.capturedWrites()).toEqual(frameText(cleaned));
  });

  it("preserves escape sequences on the wire (no decode without re-encode)", async () => {
    // The base parser does not decode escapes, so \F\ survives the
    // parse→serialize round trip verbatim — the decode-implies-encode invariant.
    const request =
      "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20241201120000||ADT^A01^ADT_A01|MSG001|P|2.5\rOBX|1|ST|x||a\\F\\b";
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AA) });
    const client = makeClient(fake);
    await client.connect();
    await client.send(request);
    const onWire = new TextDecoder().decode(unwrapFrame(fake.capturedWrites()));
    expect(onWire).toContain("a\\F\\b");
  });

  it("does not accept raw bytes as a send input (type-level)", () => {
    // SendInput is `string | Root`. A caller holding wire bytes decodes them to
    // text at its own I/O boundary (where charset / MSH-18 knowledge lives) and
    // passes the string. This is a compile-time guarantee — no runtime path.
    const bytes = new TextEncoder().encode(REQUEST);
    // @ts-expect-error — Uint8Array is not assignable to SendInput.
    const rejected: SendInput = bytes;
    expect(rejected).toBeInstanceOf(Uint8Array);
  });

  it("populates response.raw with the de-framed ACK text", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AA) });
    const client = makeClient(fake);
    await client.connect();
    const response = await client.send(REQUEST);
    expect(response.raw).toBe(ACK_AA);
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
      }
      expect(client.state).toBe("connected");
    }
  );

  it("reads errorCode/severity from the ERR segment", async () => {
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
    }
  });
});

// ---------------------------------------------------------------------------
// send() — correlation
// ---------------------------------------------------------------------------

describe("send() — correlation verification", () => {
  it("throws INVALID_RESPONSE when MSA-2 mismatches MSH-10", async () => {
    const fake = createFakeDuplex({
      onWrite: respondWith(ACK_AA_WRONG_CONTROL),
    });
    const client = makeClient(fake);
    await client.connect();
    try {
      await client.send(REQUEST);
      expect.fail("send should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MllpClientError);
      expect((error as MllpClientError).code).toBe(
        MllpErrorCode.INVALID_RESPONSE
      );
      const corr = error as MllpClientError;
      expect(corr.message).toContain(REQUEST_CONTROL_ID);
      expect(corr.message).toContain("OTHER");
    }
    // An uninterpretable reply is connection-terminal: correlation on this
    // wire can no longer be trusted, so the client closes.
    expect(client.state).toBe("closed");
  });

  it("rejects a request without MSH-10 with INVALID_MESSAGE before writing", async () => {
    // HL7v2 requires MSH-10, and without it the ACK cannot be correlated.
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AA) });
    const client = makeClient(fake);
    await client.connect();
    const noControl = "MSH|^~\\&|S|F|R|RF|20240101||ADT^A01|";
    await expect(client.send(noControl)).rejects.toMatchObject({
      code: MllpErrorCode.INVALID_MESSAGE,
    });
    // Nothing reached the wire, and the client stays usable — the
    // single-flight latch released, so the next send actually proceeds.
    expect(fake.capturedWrites().length).toBe(0);
    expect(client.state).toBe("connected");
    const response = await client.send(REQUEST);
    expect(response.code).toBe("AA");
  });

  it("correlates MSH-10 to MSA-2 at the component level", async () => {
    // Request MSH-10 carries a component suffix; the peer echoes only its
    // first component in MSA-2. They correlate at the component level —
    // request and response are both extracted via the parser, so a
    // field-level "MSGID^suffix" vs "MSGID" false mismatch can't happen.
    const request =
      "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20241201120000||ADT^A01^ADT_A01|MSGID^suffix|P|2.5\rPID|1||x";
    const fake = createFakeDuplex({
      onWrite: respondWith(requestAck("AA", "MSGID")),
    });
    const client = makeClient(fake);
    await client.connect();
    const response = await client.send(request);
    expect(response.code).toBe("AA");
    expect(response.controlId).toBe("MSGID");
  });

  it("honours a non-standard MSH-1 field separator when extracting MSH-10", async () => {
    // Field separator is '#', not '|'. The parser reads MSH-1 and honours it,
    // so MSH-10 ("CUSTOMID") is extracted and the mismatch against the peer's
    // MSA-2 is caught. A "#"-delimited request would have defeated a
    // split("|") scanner, which would skip correlation entirely.
    const request = "MSH#^~\\&#S#F#R#RF#20240101##ADT^A01#CUSTOMID#P#2.5";
    const fake = createFakeDuplex({
      onWrite: respondWith(requestAck("AA", "OTHERID")),
    });
    const client = makeClient(fake);
    await client.connect();
    await expect(client.send(request)).rejects.toMatchObject({
      code: MllpErrorCode.INVALID_RESPONSE,
    });
  });
});

// ---------------------------------------------------------------------------
// send() — malformed responses
// ---------------------------------------------------------------------------

describe("send() — malformed ACK responses", () => {
  it("throws INVALID_RESPONSE when the ACK has no MSA segment", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_NO_MSA) });
    const client = makeClient(fake);
    await client.connect();
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.INVALID_RESPONSE,
    });
  });

  it("throws INVALID_RESPONSE when MSA-1 is empty", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_EMPTY_CODE) });
    const client = makeClient(fake);
    await client.connect();
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.INVALID_RESPONSE,
    });
  });

  it("throws INVALID_RESPONSE when MSA-1 is not standard", async () => {
    const fake = createFakeDuplex({
      onWrite: respondWith(ACK_UNKNOWN_CODE),
    });
    const client = makeClient(fake);
    await client.connect();
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.INVALID_RESPONSE,
    });
  });

  it("throws INVALID_RESPONSE with a CharsetError cause when the ACK bytes are not valid UTF-8", async () => {
    // A Latin-1 / Windows-1252 peer emits a lone 0xE9. The strict (fatal) UTF-8
    // decoder must surface this as MllpClientError(INVALID_RESPONSE), not a raw
    // TypeError — the error contract is "branch on code" — with the charset
    // package's CharsetError preserved on `cause` (diagnostic, not contract).
    const invalid = new Uint8Array([0x4d, 0x53, 0x48, 0xe9]); // "MSH" + 0xE9
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => peer.injectPeerBytes(frame(invalid)),
    });
    const client = makeClient(fake);
    await client.connect();
    let captured: unknown;
    try {
      await client.send(REQUEST);
      expect.fail("send should have thrown");
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(MllpClientError);
    expect((captured as MllpClientError).code).toBe(
      MllpErrorCode.INVALID_RESPONSE
    );
    expect((captured as MllpClientError).cause).toBeInstanceOf(CharsetError);
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

  it("throws INVALID_MESSAGE with the MllpCodecError on cause for an embedded FS byte", async () => {
    const fake = createFakeDuplex();
    const client = makeClient(fake);
    await client.connect();
    // FS (0x1C) is a reserved framing byte (CR is allowed). MSH-10 is present,
    // so the reserved-character path — not the missing-control-ID path — trips.
    const bad = `MSH|^~\\&|A|B|C|D|20240101||ADT^A01|MSG1|P|2.5\rPID|1|${String.fromCodePoint(0x1c)}bad`;
    await expect(client.send(bad)).rejects.toMatchObject({
      cause: expect.objectContaining({ name: "MllpCodecError" }),
      code: MllpErrorCode.INVALID_MESSAGE,
    });
    expect(client.state).toBe("connected");
  });

  it("throws INVALID_MESSAGE for an embedded VT byte, before anything is written", async () => {
    const fake = createFakeDuplex();
    const client = makeClient(fake);
    await client.connect();
    const bad =
      "MSH|^~\\&|A|B|C|D|20240101||ADT^A01|MSG1|P|2.5\rPID|1|\u000Bbad";
    await expect(client.send(bad)).rejects.toMatchObject({
      cause: expect.objectContaining({ name: "MllpCodecError" }),
      code: MllpErrorCode.INVALID_MESSAGE,
    });
    expect(fake.capturedWrites()).toHaveLength(0);
    expect(client.state).toBe("connected");
  });
});

// ---------------------------------------------------------------------------
// send() — timeouts, abort, drop
// ---------------------------------------------------------------------------

describe("send() — timeout / abort / drop", () => {
  it("throws SEND_TIMEOUT when no ACK arrives in time", async () => {
    const fake = createFakeDuplex({ onWrite: () => {} });
    const client = makeClient(fake);
    await client.connect();
    try {
      await client.send(REQUEST, { timeoutMs: 20 });
      expect.fail("send should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MllpClientError);
      expect((error as MllpClientError).code).toBe(MllpErrorCode.SEND_TIMEOUT);
      expect((error as MllpClientError).message).toContain("20ms");
    }
    // A timeout is connection-terminal.
    expect(client.state).toBe("closed");
  });

  it("SEND_TIMEOUT fires even when the remote system never finishes reading the write", async () => {
    // The wedged-interface-engine case: the peer accepts the connection but
    // stops draining it, so the write itself parks. The send deadline covers
    // the write phase, so the send still settles.
    const fake = createFakeDuplex({
      // oxlint-disable-next-line promise/avoid-new -- a write that never settles
      onWrite: () => new Promise(() => {}),
    });
    const client = makeClient(fake, { sendTimeoutMs: 20 });
    await client.connect();
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.SEND_TIMEOUT,
    });
    expect(client.state).toBe("closed");
  });

  it("rejects pending send with DROPPED when peer drops", async () => {
    const fake = createFakeDuplex({ onWrite: () => {} });
    const client = makeClient(fake);
    await client.connect();
    const p = client.send(REQUEST);
    setTimeout(() => fake.closePeer(), 10);
    await expect(p).rejects.toMatchObject({ code: MllpErrorCode.DROPPED });
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
  it("transitions connected → closed", async () => {
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
      expect(client.state).toBe("connected");
    }
    // After the `using` block, close has been called.
    expect(fake.closeCount()).toBe(1);
  });

  it("reports 'closed' synchronously even while teardown is in flight", async () => {
    // A duplex whose teardown we hold open, so we can observe state mid-teardown.
    // close() drives the machine to "closed" synchronously (CLOSE is processed
    // synchronously) and only then awaits the duplex's `closed` signal; state
    // reports "closed" immediately, not a transient phase. The duplex honours the
    // contract: `closed` resolves once `close()` completes.
    const fake = createFakeDuplex();
    let releaseClose: (() => void) | undefined;
    // oxlint-disable-next-line promise/avoid-new -- test gate for close()
    const closeGate = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });
    let signalClosed: (() => void) | undefined;
    // oxlint-disable-next-line promise/avoid-new -- test gate for `closed`
    const closedSignal = new Promise<void>((resolve) => {
      signalClosed = resolve;
    });
    const duplex: MllpDuplex = {
      close: async () => {
        await closeGate;
        signalClosed?.();
      },
      closed: closedSignal,
      readable: fake.duplex.readable,
      writable: fake.duplex.writable,
    };
    const client = new MllpClient({
      connect: () => Promise.resolve(duplex),
      host: "test",
      port: 0,
    });
    await client.connect();
    expect(client.state).toBe("connected");

    const closing = client.close();
    expect(client.state).toBe("closed");
    expect(client.connected).toBe(false);

    releaseClose?.();
    await closing;
    expect(client.state).toBe("closed");
  });
});

// ---------------------------------------------------------------------------
// Drop detection
// ---------------------------------------------------------------------------

describe("peer drop detection", () => {
  it("transitions connected → closed when the peer drops idle", async () => {
    const fake = createFakeDuplex();
    const client = makeClient(fake);
    await client.connect();
    expect(client.state).toBe("connected");
    fake.closePeer();
    // The drop watcher defers one macrotask so in-flight deliveries win the
    // race against the closed signal; sleep past it.
    await sleep(5);
    expect(client.state).toBe("closed");
  });

  it("rejects subsequent sends with CLOSED after a drop", async () => {
    const fake = createFakeDuplex();
    const client = makeClient(fake);
    await client.connect();
    fake.closePeer();
    await sleep(5);
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.CLOSED,
    });
  });
});

// ---------------------------------------------------------------------------
// Write failure
// ---------------------------------------------------------------------------

describe("send() — write failure", () => {
  it("rejects with DROPPED(write-failed) when the duplex write fails", async () => {
    const writeError = new Error("EPIPE");
    const fake = createFakeDuplex({ writeError });
    const client = makeClient(fake);
    await client.connect();
    let captured: unknown;
    try {
      await client.send(REQUEST);
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(MllpClientError);
    expect((captured as MllpClientError).code).toBe(MllpErrorCode.DROPPED);
    expect((captured as MllpClientError).cause).toBe(writeError);
    // Write failure is terminal — connection is closed, not "connected".
    expect(client.state).toBe("closed");
  });
});

// ---------------------------------------------------------------------------
// Stream-level errors propagating from the read loop
// ---------------------------------------------------------------------------

describe("send() — peer sends unframed garbage", () => {
  it("rejects with DROPPED(framing-error) and transitions to closed", async () => {
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => {
        // No VT prefix — decoder will report UNEXPECTED_DATA.
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
    expect(captured).toBeInstanceOf(MllpClientError);
    expect((captured as MllpClientError).code).toBe(MllpErrorCode.DROPPED);
    expect((captured as MllpClientError).cause).toMatchObject({
      code: "UNEXPECTED_DATA",
      name: "MllpCodecError",
    });
    // Stream-level error is terminal — subsequent sends fail fast.
    expect(client.state).toBe("closed");
  });
});

describe("send() — unparseable ACK (no MSA-1)", () => {
  it("rejects with INVALID_RESPONSE when the ACK has no acknowledgment code", async () => {
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => {
        peer.injectPeerBytes(frameText("GARBAGE WITHOUT MSH SEGMENT"));
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
    expect((captured as MllpClientError).code).toBe(
      MllpErrorCode.INVALID_RESPONSE
    );
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
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.DROPPED,
    });
    expect(client.state).toBe("closed");
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.CLOSED,
    });
  });

  it("write failure closes the connection (subsequent sends throw CLOSED)", async () => {
    const fake = createFakeDuplex({ writeError: new Error("EPIPE") });
    const client = makeClient(fake);
    await client.connect();
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.DROPPED,
    });
    expect(client.state).toBe("closed");
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.CLOSED,
    });
  });
});

describe("frame-queue overflow protection", () => {
  it("closes the connection when the peer floods unsolicited frames", async () => {
    // Answer the first send normally (it also captures the peer handle),
    // then inject the overflow flood as a discrete event with no send
    // pending. This avoids the race where the flood + the legit ACK arrive
    // in one decoder pass and the overflow's pendingError races the legit
    // send's resolution.
    let peerRef: FakeDuplex | null = null;
    const fake = createFakeDuplex({
      onWrite: (chunk, peer) => {
        peerRef = peer;
        peer.injectPeerBytes(
          frameText(requestAck("AA", controlIdOfFrame(chunk)))
        );
      },
    });
    const client = makeClient(fake);
    await client.connect();
    // Flood the peer with frames the client never asked for.
    const single = frameText(ACK_AA);
    const coalesced = new Uint8Array(single.length * 32);
    for (let i = 0; i < 32; i++) {
      coalesced.set(single, i * single.length);
    }
    await client.send(REQUEST);
    expect(client.state).toBe("connected");
    peerRef!.injectPeerBytes(coalesced);
    // Yield for the read loop to drain the chunk.
    await sleep(10);
    expect(client.state).toBe("closed");
  });
});

describe("inbound buffering bound", () => {
  it("maxBufferedBytes is enforced end-to-end: an unterminated flood drops the connection", async () => {
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => {
        // VT then an unterminated body well past the cap — never an FS+CR.
        const flood = new Uint8Array(257).fill(0x41);
        flood[0] = 0x0b;
        peer.injectPeerBytes(flood);
      },
    });
    const client = new MllpClient({
      connect: () => Promise.resolve(fake.duplex),
      host: "test",
      maxBufferedBytes: 128,
      port: 0,
    });
    await client.connect();
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      cause: expect.objectContaining({ code: "MESSAGE_TOO_LARGE" }),
      code: MllpErrorCode.DROPPED,
    });
    expect(client.state).toBe("closed");
  });
});

describe("stalled partial response (slowloris)", () => {
  it("drops the connection when the next response glues into the unterminated frame", async () => {
    // First call: trickle in just VT — a partial frame that stalls; the send
    // times out and closes the client (timeouts are terminal). The stalled
    // partial can never glue with a later response because the wire is gone.
    let callCount = 0;
    const fake = createFakeDuplex({
      onWrite: (_chunk, peer) => {
        callCount += 1;
        if (callCount === 1) {
          peer.injectPeerBytes(new Uint8Array([0x0b]));
        } else {
          peer.injectPeerBytes(frameText(ACK_AA));
        }
      },
    });
    const client = makeClient(fake);
    await client.connect();
    await expect(client.send(REQUEST, { timeoutMs: 20 })).rejects.toMatchObject(
      { code: MllpErrorCode.SEND_TIMEOUT }
    );
    // The timeout already tore the connection down.
    expect(client.state).toBe("closed");

    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.CLOSED,
    });
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

// ---------------------------------------------------------------------------
// Single-flight. One send is on the wire at a time. A FIFO send queue is
// deferred to a later version, so a concurrent send while one is in
// flight rejects with ALREADY_SENDING. After a send settles (ACK, NAK, or
// timeout), the next send proceeds; close()/drop reject the in-flight send.
// ---------------------------------------------------------------------------

/**
 * Strip the MLLP envelope (`<VT> payload <FS><CR>`) from one frame this
 * client produced. Test-local: production reads the wire through unframe().
 */
function unwrapFrame(wire: Uint8Array): Uint8Array {
  return wire.subarray(1, -2);
}

/**
 * Read MSH-10 (control id) out of a written MLLP frame using the glion
 * parser and query utility — the same path the client uses internally —
 * rather than a hand-rolled split.
 */
function controlIdOfFrame(chunk: Uint8Array): string {
  const text = new TextDecoder().decode(unwrapFrame(chunk));
  const tree = parseHL7v2(text);
  return value(tree, "MSH-10[1].1.1")?.value ?? "";
}

describe("send() — single-flight", () => {
  it("runs sequential sends one after another", async () => {
    const fake = createFakeDuplex({ onWrite: respondWith(ACK_AA) });
    const client = makeClient(fake);
    await client.connect();
    const r1 = await client.send(REQUEST);
    const r2 = await client.send(REQUEST);
    expect(r1.code).toBe("AA");
    expect(r2.code).toBe("AA");
    expect(client.state).toBe("connected");
  });

  it("rejects a concurrent send with ALREADY_SENDING while one is in flight", async () => {
    const fake = createFakeDuplex({ onWrite: () => {} }); // peer silent — p1 stays in flight
    const client = makeClient(fake);
    await client.connect();

    const p1 = client.send(REQUEST); // occupies the wire
    const p1Settled = p1.then(noop, noop);
    await expect(client.send(REQUEST)).rejects.toMatchObject({
      code: MllpErrorCode.ALREADY_SENDING,
    });

    // close() releases the in-flight send so it isn't an unhandled rejection.
    await client.close();
    await expect(p1).rejects.toMatchObject({ code: MllpErrorCode.CLOSED });
    await p1Settled;
  });

  it("lets the next send proceed after the in-flight send draws a NAK", async () => {
    // An application-level rejection must not wedge the client.
    let writes = 0;
    const fake = createFakeDuplex({
      onWrite: (chunk, peer) => {
        writes += 1;
        const code = writes === 1 ? "AR" : "AA";
        peer.injectPeerBytes(
          frameText(requestAck(code, controlIdOfFrame(chunk)))
        );
      },
    });
    const client = makeClient(fake);
    await client.connect();

    await expect(
      client.send(requestWithControlId("FIRST"))
    ).rejects.toBeInstanceOf(AckApplicationReject);
    const r2 = await client.send(requestWithControlId("SECOND"));
    expect(r2.code).toBe("AA");
    expect(client.state).toBe("connected");
  });

  it("a send timeout closes the client; the next send needs a new client", async () => {
    // The peer never answers. The timed-out send rejects with SEND_TIMEOUT
    // and the connection is recycled — a late ACK could never be matched
    // safely, so the wire is not reused.
    const fake = createFakeDuplex({ onWrite: () => {} });
    const client = makeClient(fake);
    await client.connect();

    await expect(
      client.send(requestWithControlId("FIRST"), { timeoutMs: 20 })
    ).rejects.toMatchObject({ code: MllpErrorCode.SEND_TIMEOUT });
    expect(client.state).toBe("closed");
    await expect(
      client.send(requestWithControlId("SECOND"))
    ).rejects.toMatchObject({ code: MllpErrorCode.CLOSED });
  });

  it("rejects the in-flight send with CLOSED on close()", async () => {
    const fake = createFakeDuplex({ onWrite: () => {} }); // peer silent
    const client = makeClient(fake);
    await client.connect();

    const p1 = client.send(REQUEST);
    await client.close();
    await expect(p1).rejects.toMatchObject({ code: MllpErrorCode.CLOSED });
    await expect(p1).rejects.toBeInstanceOf(MllpClientError);
    expect(client.state).toBe("closed");
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
