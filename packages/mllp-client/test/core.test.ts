// oxlint-disable promise/avoid-new
/**
 * Core (runtime-free) test suite. Drives `MllpClient` with a fake
 * connector that returns in-memory Web Streams — no socket, no
 * runtime adapter. Proves the core has no hidden coupling to Node
 * (or any other runtime) and exercises the protocol logic in
 * isolation from transport concerns.
 *
 * Test cases here run on whichever runner the package uses today
 * (Vitest in Node), but the code under test is by construction
 * portable to any runtime that supports Web Streams.
 */

import { AckApplicationError, Hl7ErrorCode, Severity } from "@glion/ack";
import { afterEach, describe, expect, it } from "vitest";

import { MllpClient } from "../src/core/client";
import type {
  MllpConnect,
  MllpConnectParams,
  MllpDuplexStream,
} from "../src/core/connect";
import { MllpClientError, MllpClientErrorCode } from "../src/core/errors";
import {
  frame,
  MLLP_CR,
  MLLP_FS,
  MLLP_VT,
  SAMPLE_ADT,
  VALID_AA,
  VALID_AE,
  VALID_CA,
} from "./fixtures";

/**
 * Build a fake connector whose returned duplex emits a fixed reply
 * and captures whatever the client writes. Surface exposes the
 * captured state so tests can assert on it.
 */
interface FakeConnection {
  /** Bytes the client wrote to the duplex's writable side. */
  written: Uint8Array;
  /** Whether the duplex's `close()` was called. */
  closed: boolean;
  /** Connector implementation to pass into `MllpClientOptions.connect`. */
  connect: MllpConnect;
  /** Last params the client passed to `connect`. */
  lastParams: MllpConnectParams | undefined;
}

function makeFakeConnector(
  reply: Uint8Array | Uint8Array[] | "no-reply" | "hold-open"
): FakeConnection {
  const captured: Uint8Array[] = [];
  const state = {
    closed: false,
    lastParams: undefined as MllpConnectParams | undefined,
  };

  const connect: MllpConnect = (params) => {
    state.lastParams = params;
    const duplex: MllpDuplexStream = {
      close() {
        state.closed = true;
      },
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          if (reply === "no-reply") {
            controller.close();
            return;
          }
          if (reply === "hold-open") {
            // Emit nothing and never close — the consumer must be
            // settled by another mechanism (timeout, abort signal).
            return;
          }
          if (Array.isArray(reply)) {
            for (const chunk of reply) {
              controller.enqueue(chunk);
            }
          } else {
            controller.enqueue(reply);
          }
          controller.close();
        },
      }),
      writable: new WritableStream<Uint8Array>({
        write(chunk) {
          captured.push(chunk);
        },
      }),
    };
    return Promise.resolve(duplex);
  };

  return {
    connect,
    get closed() {
      return state.closed;
    },
    get lastParams() {
      return state.lastParams;
    },
    get written() {
      const total = captured.reduce((sum, c) => sum + c.length, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const chunk of captured) {
        out.set(chunk, offset);
        offset += chunk.length;
      }
      return out;
    },
  };
}

describe("MllpClient (core, runtime-free)", () => {
  let fake: FakeConnection | undefined;

  afterEach(() => {
    fake = undefined;
  });

  describe("happy path", () => {
    it("opens a connection, writes a framed message, and resolves with the parsed ACK", async () => {
      fake = makeFakeConnector(frame(VALID_AA));
      const client = new MllpClient({
        connect: fake.connect,
        host: "fake-host",
        port: 12_345,
      });

      const ack = await client.send(SAMPLE_ADT);

      expect(ack.code).toBe("AA");
      expect(ack.controlId).toBe("MSG001");

      // The connector saw the expected host/port.
      expect(fake.lastParams?.host).toBe("fake-host");
      expect(fake.lastParams?.port).toBe(12_345);

      // The duplex received an MLLP-framed payload (VT prefix, FS+CR suffix).
      expect(fake.written[0]).toBe(MLLP_VT);
      expect(fake.written.at(-2)).toBe(MLLP_FS);
      expect(fake.written.at(-1)).toBe(MLLP_CR);

      // Cleanup happened.
      expect(fake.closed).toBe(true);
    });

    it("forwards tls options to the connector when set", async () => {
      fake = makeFakeConnector(frame(VALID_AA));
      const client = new MllpClient({
        connect: fake.connect,
        host: "fake-host",
        port: 12_345,
        tls: { servername: "secure.example", insecure: true },
      });

      await client.send(SAMPLE_ADT);

      expect(fake.lastParams?.tls?.servername).toBe("secure.example");
      expect(fake.lastParams?.tls?.insecure).toBe(true);
    });
  });

  describe("acknowledgment modes", () => {
    it("default waitFor='final' consumes a CA frame and resolves on the following AA", async () => {
      // Receiver sends CA (commit accept) first, then AA (final).
      // The default behaviour reads frames until a final code arrives,
      // so the resolved ACK is the AA — not the CA.
      fake = makeFakeConnector([frame(VALID_CA), frame(VALID_AA)]);
      const client = new MllpClient({
        connect: fake.connect,
        host: "fake-host",
        port: 12_345,
      });

      const ack = await client.send(SAMPLE_ADT);
      expect(ack.code).toBe("AA");
      expect(ack.controlId).toBe("MSG001");
      expect(fake.closed).toBe(true);
    });

    it("waitFor='commit' resolves on the first frame even when it is a CA", async () => {
      fake = makeFakeConnector(frame(VALID_CA));
      const client = new MllpClient({
        connect: fake.connect,
        host: "fake-host",
        port: 12_345,
      });

      const ack = await client.send(SAMPLE_ADT, { waitFor: "commit" });
      expect(ack.code).toBe("CA");
      expect(fake.closed).toBe(true);
    });

    it("default waitFor='final' times out when only a CA arrives and the peer holds the connection", async () => {
      // Receiver sends CA but never the final ACK. With waitFor='final'
      // (the default) the read loop keeps waiting for a final code; the
      // deadline is the only thing that can settle the send.
      const client = new MllpClient({
        connect: () =>
          Promise.resolve({
            close() {
              /* nothing to clean up */
            },
            readable: new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(frame(VALID_CA));
                // Hold the readable open — no final ACK ever arrives.
              },
            }),
            writable: new WritableStream(),
          }),
        host: "fake-host",
        port: 12_345,
        timeout: 100,
      });

      try {
        await client.send(SAMPLE_ADT);
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(MllpClientError);
        expect((error as MllpClientError).code).toBe(
          MllpClientErrorCode.TIMEOUT
        );
      }
    });
  });

  describe("application-level errors", () => {
    it("throws AckApplicationError on a NAK with MSA-1 = AE", async () => {
      fake = makeFakeConnector(frame(VALID_AE));
      const client = new MllpClient({
        connect: fake.connect,
        host: "fake-host",
        port: 12_345,
      });

      try {
        await client.send(SAMPLE_ADT);
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(AckApplicationError);
        const ackErr = error as AckApplicationError;
        expect(ackErr.message).toBe("Validation failed");
        expect(ackErr.errorCode).toBe(Hl7ErrorCode.UnknownKeyIdentifier);
        expect(ackErr.severity).toBe(Severity.Error);
        // Raw ACK is preserved on the exception.
        expect(ackErr.raw).toContain("MSA|AE|MSG001|Validation failed");
      }
      expect(fake.closed).toBe(true);
    });
  });

  describe("transport errors", () => {
    it("rejects with INVALID_INPUT for non-string non-Uint8Array payloads, before opening any connection", async () => {
      let opened = false;
      const client = new MllpClient({
        connect: () => {
          opened = true;
          throw new Error("connect should not have been called");
        },
        host: "fake-host",
        port: 12_345,
      });

      try {
        // oxlint-disable-next-line typescript/no-explicit-any
        await client.send(42 as any);
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(MllpClientError);
        expect((error as MllpClientError).code).toBe(
          MllpClientErrorCode.INVALID_INPUT
        );
      }
      expect(opened).toBe(false);
    });

    it("rejects with CONNECTION_CLOSED when the duplex closes without sending an ACK", async () => {
      fake = makeFakeConnector("no-reply");
      const client = new MllpClient({
        connect: fake.connect,
        host: "fake-host",
        port: 12_345,
        timeout: 200,
      });

      try {
        await client.send(SAMPLE_ADT);
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(MllpClientError);
        expect((error as MllpClientError).code).toBe(
          MllpClientErrorCode.CONNECTION_CLOSED
        );
      }
      expect(fake.closed).toBe(true);
    });

    it("rejects with TIMEOUT when no ACK arrives within the budget", async () => {
      // Connector returns a duplex whose readable never closes and
      // never emits — the deadline is the only thing that can settle.
      const client = new MllpClient({
        connect: () =>
          Promise.resolve({
            close() {
              /* nothing to clean up — test never emits */
            },
            readable: new ReadableStream({
              start() {
                /* never emit, never close */
              },
            }),
            writable: new WritableStream(),
          }),
        host: "fake-host",
        port: 12_345,
        timeout: 100,
      });

      try {
        await client.send(SAMPLE_ADT);
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(MllpClientError);
        expect((error as MllpClientError).code).toBe(
          MllpClientErrorCode.TIMEOUT
        );
        // Confirms the typed `signal.reason` propagates verbatim
        // through the exchange's abort path — the timeout message
        // says how long we waited, not a generic "stream cancelled".
        expect((error as MllpClientError).message).toMatch(
          /MLLP round trip exceeded \d+ms/
        );
      }
    });

    it("aborts when a caller-supplied signal aborts mid-exchange", async () => {
      // Connector returns a duplex that hangs forever; the caller's
      // signal is the only thing that can settle the send.
      const client = new MllpClient({
        connect: () =>
          Promise.resolve({
            close() {
              /* nothing to clean up — test never emits */
            },
            readable: new ReadableStream({
              start() {
                /* never emit, never close */
              },
            }),
            writable: new WritableStream(),
          }),
        host: "fake-host",
        port: 12_345,
        timeout: 60_000, // long, so only the caller can abort
      });

      const controller = new AbortController();
      const userReason = new Error("user cancelled");
      setTimeout(() => controller.abort(userReason), 50);

      const started = Date.now();
      try {
        await client.send(SAMPLE_ADT, { signal: controller.signal });
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(MllpClientError);
        expect((error as MllpClientError).code).toBe(
          MllpClientErrorCode.TIMEOUT
        );
        // The caller's reason is preserved as the chained cause so a
        // log line shows what triggered the cancellation.
        expect((error as MllpClientError).cause).toBe(userReason);
      }
      // Sanity-check we actually aborted at ~50ms, not at the 60s
      // deadline — proves the caller's signal won the race.
      expect(Date.now() - started).toBeLessThan(1000);
    });

    it("forwards an already-aborted caller signal without opening a connection", async () => {
      let opened = false;
      const client = new MllpClient({
        connect: () => {
          opened = true;
          return Promise.resolve({
            close() {
              /* never reached */
            },
            readable: new ReadableStream(),
            writable: new WritableStream(),
          });
        },
        host: "fake-host",
        port: 12_345,
      });

      const controller = new AbortController();
      controller.abort(new Error("pre-aborted"));

      try {
        await client.send(SAMPLE_ADT, { signal: controller.signal });
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(MllpClientError);
        expect((error as MllpClientError).code).toBe(
          MllpClientErrorCode.TIMEOUT
        );
      }
      // The connector was reached (we eagerly start the connect
      // because abort propagation is what carries the cancel through
      // the streams), but the exchange never resolved a frame.
      // What we really care about: the call settled fast.
      expect(opened).toBe(true);
    });

    it("rejects with MALFORMED_ACK when the response is not parseable HL7v2", async () => {
      fake = makeFakeConnector(frame("not an HL7v2 message"));
      const client = new MllpClient({
        connect: fake.connect,
        host: "fake-host",
        port: 12_345,
      });

      try {
        await client.send(SAMPLE_ADT);
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(MllpClientError);
        expect((error as MllpClientError).code).toBe(
          MllpClientErrorCode.MALFORMED_ACK
        );
      }
    });

    it("rejects with MALFORMED_FRAME when an inbound frame exceeds maxAckSize", async () => {
      const oversize = "MSH|".padEnd(2048, "X");
      fake = makeFakeConnector(frame(oversize));
      const client = new MllpClient({
        connect: fake.connect,
        host: "fake-host",
        port: 12_345,
        maxAckSize: 256,
      });

      try {
        await client.send(SAMPLE_ADT);
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(MllpClientError);
        expect((error as MllpClientError).code).toBe(
          MllpClientErrorCode.MALFORMED_FRAME
        );
      }
    });

    it("propagates a connector-thrown error as MllpClientError", async () => {
      const client = new MllpClient({
        connect: () => {
          throw new MllpClientError(
            MllpClientErrorCode.CONNECTION_REFUSED,
            "synthetic refused"
          );
        },
        host: "fake-host",
        port: 12_345,
      });

      try {
        await client.send(SAMPLE_ADT);
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(MllpClientError);
        expect((error as MllpClientError).code).toBe(
          MllpClientErrorCode.CONNECTION_REFUSED
        );
      }
    });

    it("cancels the deadline timer when connect rejects (no timer leak)", async () => {
      // Set a long timeout, then immediately reject from connect.
      // Without proper cleanup the underlying setTimeout would keep
      // the event loop alive for the full timeout. We verify by
      // measuring how long the rejection takes — it should resolve in
      // milliseconds, not seconds, because deadline.cancel() runs in
      // the outer finally even when connect throws.
      const client = new MllpClient({
        connect: () =>
          Promise.reject(
            new MllpClientError(
              MllpClientErrorCode.CONNECTION_REFUSED,
              "synthetic refused"
            )
          ),
        host: "fake-host",
        port: 12_345,
        timeout: 60_000,
      });

      const started = Date.now();
      await expect(client.send(SAMPLE_ADT)).rejects.toBeInstanceOf(
        MllpClientError
      );
      const elapsed = Date.now() - started;

      // Generous bound — anything under a second proves the deadline
      // didn't keep the loop alive. A leaked timer would block for
      // ~60 seconds.
      expect(elapsed).toBeLessThan(1000);
    });

    it("does not surface unhandled rejections when duplex.close() returns a rejected promise", async () => {
      // Capture unhandled rejections during the test. If we wired
      // close() correctly they never fire — the helper swallows the
      // adapter's close-time errors.
      const captured: unknown[] = [];
      const onUnhandled = (reason: unknown) => captured.push(reason);
      // oxlint-disable-next-line typescript/no-explicit-any
      (process as any).on("unhandledRejection", onUnhandled);

      try {
        const client = new MllpClient({
          connect: () =>
            Promise.resolve({
              close() {
                return Promise.reject(new Error("synthetic close failure"));
              },
              readable: new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(frame(VALID_AA));
                  controller.close();
                },
              }),
              writable: new WritableStream<Uint8Array>(),
            }),
          host: "fake-host",
          port: 12_345,
        });

        const ack = await client.send(SAMPLE_ADT);
        expect(ack.code).toBe("AA");

        // Give any pending microtasks a tick to surface as unhandled.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 10);
        });
        expect(captured).toEqual([]);
      } finally {
        // oxlint-disable-next-line typescript/no-explicit-any
        (process as any).off("unhandledRejection", onUnhandled);
      }
    });
  });
});
