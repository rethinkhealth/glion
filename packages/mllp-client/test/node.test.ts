// oxlint-disable promise/avoid-new
// oxlint-disable no-empty-function
// oxlint-disable promise/prefer-await-to-callbacks
import { createServer } from "node:net";
import type { Server as NetServer, Socket } from "node:net";

import {
  AckApplicationError,
  AckApplicationReject,
  AckCommitError,
  AckCommitReject,
  Hl7ErrorCode,
  Severity,
} from "@glion/ack";
import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";
import { ackMiddleware } from "@glion/mllp-ack";
import { MllpError } from "@glion/mllp-transport";
import { serve } from "@glion/mllp/node";
import type { Server } from "@glion/mllp/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MllpClientError, MllpClientErrorCode } from "../src/core/errors";
import { MllpClient } from "../src/runtimes/node";
import { frame, SAMPLE_ADT } from "./fixtures";

interface ServerHandle {
  server: Server;
  port: number;
}

async function startServer(app: Mllp): Promise<ServerHandle> {
  const server = serve(app, { port: 0 });
  await server.listening;
  return { port: server.port, server };
}

/**
 * Raw TCP server for transport-level test cases. Lets each test
 * control exactly what bytes get sent back (or not sent at all),
 * which is needed to exercise MALFORMED_ACK / MALFORMED_FRAME /
 * CONNECTION_CLOSED paths that a well-behaved MLLP server would
 * never produce.
 */
interface RawServerHandle {
  port: number;
  /** Sockets accepted so far. Useful for asserting cleanup state. */
  sockets: Socket[];
  close(): Promise<void>;
}

async function startRawServer(
  onConnection: (socket: Socket) => void
): Promise<RawServerHandle> {
  const sockets: Socket[] = [];
  const server: NetServer = createServer((socket) => {
    sockets.push(socket);
    onConnection(socket);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine server port");
  }
  return {
    close() {
      return new Promise<void>((resolve) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close(() => resolve());
      });
    },
    port: address.port,
    sockets,
  };
}

describe("MllpClient.send", () => {
  let handle: ServerHandle | undefined;

  afterEach(async () => {
    if (handle) {
      await handle.server.close();
      handle = undefined;
    }
  });

  describe("AA (success)", () => {
    beforeEach(async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware());
      app.on("ADT^A01", () => {});
      handle = await startServer(app);
    });

    it("returns the parsed ACK on AA", async () => {
      const client = new MllpClient({ host: "127.0.0.1", port: handle!.port });
      const ack = await client.send(SAMPLE_ADT);

      expect(ack.code).toBe("AA");
      expect(ack.controlId).toBe("MSG001");
      expect(ack.tree).toBeDefined();
    });

    it("accepts a Uint8Array payload", async () => {
      const client = new MllpClient({ host: "127.0.0.1", port: handle!.port });
      const bytes = new TextEncoder().encode(SAMPLE_ADT);

      const ack = await client.send(bytes);

      expect(ack.code).toBe("AA");
    });
  });

  describe("AE (application error)", () => {
    beforeEach(async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware());
      app.on("ADT^A01", () => {
        throw new AckApplicationError("Validation failed", {
          errorCode: Hl7ErrorCode.UnknownKeyIdentifier,
          severity: Severity.Error,
        });
      });
      handle = await startServer(app);
    });

    it("throws AckApplicationError with the receiver's message and codes", async () => {
      const client = new MllpClient({ host: "127.0.0.1", port: handle!.port });

      const promise = client.send(SAMPLE_ADT);

      await expect(promise).rejects.toBeInstanceOf(AckApplicationError);

      try {
        await client.send(SAMPLE_ADT);
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(AckApplicationError);
        const ackErr = error as AckApplicationError;
        expect(ackErr.message).toBe("Validation failed");
        expect(ackErr.errorCode).toBe(Hl7ErrorCode.UnknownKeyIdentifier);
        expect(ackErr.severity).toBe(Severity.Error);
      }
    });

    it("attaches the raw ACK to the thrown exception", async () => {
      const client = new MllpClient({ host: "127.0.0.1", port: handle!.port });

      try {
        await client.send(SAMPLE_ADT);
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(AckApplicationError);
        const ackErr = error as AckApplicationError;
        expect(ackErr.raw).toBeTypeOf("string");
        expect(ackErr.raw).toContain("MSA|AE|MSG001|Validation failed");
      }
    });
  });

  describe("AR (application reject)", () => {
    beforeEach(async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware());
      app.on("ADT^A01", () => {
        throw new AckApplicationReject("Unsupported version", {
          errorCode: Hl7ErrorCode.UnsupportedVersionId,
          severity: Severity.Error,
        });
      });
      handle = await startServer(app);
    });

    it("throws AckApplicationReject", async () => {
      const client = new MllpClient({ host: "127.0.0.1", port: handle!.port });

      try {
        await client.send(SAMPLE_ADT);
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(AckApplicationReject);
        expect((error as AckApplicationReject).errorCode).toBe(
          Hl7ErrorCode.UnsupportedVersionId
        );
      }
    });
  });

  describe("CE (commit error)", () => {
    beforeEach(async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware());
      app.on("ADT^A01", () => {
        throw new AckCommitError("Storage unavailable", {
          errorCode: Hl7ErrorCode.ApplicationInternalError,
          severity: Severity.Error,
        });
      });
      handle = await startServer(app);
    });

    it("throws AckCommitError", async () => {
      const client = new MllpClient({ host: "127.0.0.1", port: handle!.port });

      try {
        await client.send(SAMPLE_ADT);
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(AckCommitError);
        expect((error as AckCommitError).message).toBe("Storage unavailable");
      }
    });
  });

  describe("CR (commit reject)", () => {
    beforeEach(async () => {
      const app = new Mllp().parser(parseHL7v2);
      app.use(ackMiddleware());
      app.on("ADT^A01", () => {
        throw new AckCommitReject("Cannot commit", {
          errorCode: Hl7ErrorCode.ApplicationInternalError,
          severity: Severity.Error,
        });
      });
      handle = await startServer(app);
    });

    it("throws AckCommitReject", async () => {
      const client = new MllpClient({ host: "127.0.0.1", port: handle!.port });

      try {
        await client.send(SAMPLE_ADT);
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(AckCommitReject);
      }
    });
  });

  describe("transport errors", () => {
    it("throws CONNECTION_REFUSED when no server is listening", async () => {
      // Bind and immediately close to obtain a definitely-free port.
      const app = new Mllp().parser(parseHL7v2).on("ADT^A01", () => {});
      app.use(ackMiddleware());
      const tmp = serve(app, { port: 0 });
      await tmp.listening;
      const closedPort = tmp.port;
      await tmp.close();

      const client = new MllpClient({
        host: "127.0.0.1",
        port: closedPort,
        timeout: 2000,
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

    it("throws TIMEOUT when the server never responds", async () => {
      const app = new Mllp().parser(parseHL7v2);
      // No middleware, no handler — message is decoded but no response is written.
      app.on("ADT^A01", () => {});
      handle = await startServer(app);

      const client = new MllpClient({
        host: "127.0.0.1",
        port: handle.port,
        timeout: 200,
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

    it("throws CONNECTION_CLOSED when the peer closes without sending an ACK", async () => {
      // Server accepts then immediately ends — no MLLP frame ever arrives.
      const raw = await startRawServer((socket) => {
        socket.on("data", () => socket.end());
      });
      const client = new MllpClient({
        host: "127.0.0.1",
        port: raw.port,
        timeout: 5000,
      });

      try {
        await client.send(SAMPLE_ADT);
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(MllpClientError);
        expect((error as MllpClientError).code).toBe(
          MllpClientErrorCode.CONNECTION_CLOSED
        );
      } finally {
        await raw.close();
      }
    });

    it("throws MALFORMED_ACK when the response is not a valid HL7v2 ACK", async () => {
      // Reply with a properly framed MLLP envelope whose payload isn't HL7v2
      // (no MSA segment to read MSA-1 from). The decoder hands it off; the
      // parser fails to extract MSA-1; parseAck throws MALFORMED_ACK.
      const raw = await startRawServer((socket) => {
        socket.on("data", () => {
          socket.write(frame("not an HL7v2 message at all"));
        });
      });
      const client = new MllpClient({
        host: "127.0.0.1",
        port: raw.port,
        timeout: 5000,
      });

      try {
        await client.send(SAMPLE_ADT);
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(MllpClientError);
        expect((error as MllpClientError).code).toBe(
          MllpClientErrorCode.MALFORMED_ACK
        );
      } finally {
        await raw.close();
      }
    });

    it("throws MALFORMED_FRAME when an inbound frame exceeds maxAckSize", async () => {
      // Reply with a valid frame whose payload exceeds the configured cap.
      // The decoder reports MESSAGE_TOO_LARGE; the client maps it to
      // MALFORMED_FRAME.
      const oversizedAck = "MSH|^~\\&|".padEnd(2048, "X");
      const raw = await startRawServer((socket) => {
        socket.on("data", () => {
          socket.write(frame(oversizedAck));
        });
      });
      const client = new MllpClient({
        host: "127.0.0.1",
        port: raw.port,
        timeout: 5000,
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
      } finally {
        await raw.close();
      }
    });

    it("transport errors are also instanceof MllpError (cross-package identity)", async () => {
      // Catches the case where MllpError is duplicated across builds —
      // the client must throw an error that the shared base class
      // recognises so consumers can do `instanceof MllpError` once.
      const app = new Mllp().parser(parseHL7v2).on("ADT^A01", () => {});
      app.use(ackMiddleware());
      const tmp = serve(app, { port: 0 });
      await tmp.listening;
      const closedPort = tmp.port;
      await tmp.close();

      const client = new MllpClient({
        host: "127.0.0.1",
        port: closedPort,
        timeout: 2000,
      });

      try {
        await client.send(SAMPLE_ADT);
        expect.fail("expected throw");
      } catch (error) {
        expect(error).toBeInstanceOf(MllpError);
        expect(error).toBeInstanceOf(MllpClientError);
      }
    });

    it("destroys the socket after a successful send", async () => {
      // Capture the server-side socket and verify it gets closed by
      // the client's graceful end (FIN). Demonstrates the cleanup
      // contract for resource-conscious deployments.
      const raw = await startRawServer((socket) => {
        socket.on("data", () => {
          socket.write(
            frame(
              "MSH|^~\\&|R|F|S|F|20240101120000||ACK|MSG001|P|2.5.1\rMSA|AA|MSG001"
            )
          );
        });
      });

      try {
        const client = new MllpClient({
          host: "127.0.0.1",
          port: raw.port,
          timeout: 5000,
        });

        const ack = await client.send(SAMPLE_ADT);
        expect(ack.code).toBe("AA");
        expect(raw.sockets.length).toBe(1);

        // Wait deterministically for the server-side socket to enter
        // a closed/half-closed state instead of polling on a fixed
        // sleep — fixed sleeps are flaky on slow CI runners.
        const peer = raw.sockets[0];
        if (peer && !(peer.destroyed || peer.readableEnded)) {
          await new Promise<void>((resolve) => {
            peer.once("close", () => resolve());
            peer.once("end", () => resolve());
          });
        }
        expect(peer?.destroyed || peer?.readableEnded).toBe(true);
      } finally {
        await raw.close();
      }
    });
  });
});
