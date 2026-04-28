// oxlint-disable require-await
// oxlint-disable no-empty-function
// oxlint-disable promise/avoid-new
import net from "node:net";

import { parseHL7v2 } from "@glion/hl7v2";
import {
  encode,
  MLLP_END_BYTE_1,
  MLLP_END_BYTE_2,
} from "@glion/mllp-transport";

import { serve } from "../../src/node/serve.js";
import type { Server } from "../../src/node/serve.js";
import { Mllp } from "../../src/server/mllp.js";

const SAMPLE_ADT = [
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1",
  "EVN|A01|20240101120000",
  "PID|1||12345^^^MRN||Doe^John",
].join("\r");

const SAMPLE_ORU = [
  "MSH|^~\\&|Lab|Fac|App|Fac|20240101||ORU^R01|MSG002|P|2.5.1",
  "PID|1||99999",
  "OBR|1||LAB123|CBC",
].join("\r");

/**
 * Extract the HL7v2 message from MLLP-framed response buffers.
 * Strips the leading VT byte and trailing FS + CR.
 */
function extractResponse(chunks: Buffer[]): string {
  const combined = Buffer.concat(chunks);
  // Skip VT (0x0B) at start, strip FS (0x1C) + CR (0x0D) at end
  return combined.subarray(1, -2).toString("utf8");
}

/**
 * Connect to a local TCP server and send an MLLP-framed message.
 * Returns the decoded response string, or `undefined` if no response
 * arrives within `timeoutMs`.
 */
function sendMessage(
  port: number,
  message: string,
  timeoutMs = 5000
): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const client = net.connect({ host: "127.0.0.1", port }, () => {
      client.write(encode(message));
    });

    const chunks: Buffer[] = [];
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.destroy();
        resolve(chunks.length > 0 ? extractResponse(chunks) : undefined);
      }
    }, timeoutMs);

    client.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      const combined = Buffer.concat(chunks);
      // Check if we have a complete MLLP frame (ends with FS CR)
      if (
        combined.length >= 3 &&
        combined.at(-2) === MLLP_END_BYTE_1 &&
        combined.at(-1) === MLLP_END_BYTE_2
      ) {
        resolved = true;
        clearTimeout(timer);
        client.destroy();
        resolve(extractResponse(chunks));
      }
    });

    client.on("error", (err) => {
      clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
  });
}

/**
 * Open a persistent TCP connection and provide helpers to send
 * multiple messages on the same socket.
 */
function createPersistentClient(port: number): {
  send: (message: string, timeoutMs?: number) => Promise<string | undefined>;
  destroy: () => void;
} {
  const client = net.connect({ host: "127.0.0.1", port });

  const send = (
    message: string,
    timeoutMs = 5000
  ): Promise<string | undefined> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          client.removeAllListeners("data");
          resolve(chunks.length > 0 ? extractResponse(chunks) : undefined);
        }
      }, timeoutMs);

      const onData = (chunk: Buffer) => {
        chunks.push(chunk);
        const combined = Buffer.concat(chunks);
        if (
          combined.length >= 3 &&
          combined.at(-2) === MLLP_END_BYTE_1 &&
          combined.at(-1) === MLLP_END_BYTE_2
        ) {
          resolved = true;
          clearTimeout(timer);
          client.removeListener("data", onData);
          resolve(extractResponse(chunks));
        }
      };

      const onError = (err: Error) => {
        clearTimeout(timer);
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      };

      client.on("data", onData);
      client.once("error", onError);

      client.write(encode(message));
    });

  return {
    destroy: () => client.destroy(),
    send,
  };
}

/**
 * Wait for the server to be ready to accept connections.
 */
function waitForReady(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = net.connect({ host: "127.0.0.1", port }, () => {
      client.destroy();
      resolve();
    });
    client.on("error", (err) => {
      reject(err);
    });
  });
}

function createApp() {
  return new Mllp().parser(parseHL7v2);
}

describe("serve() integration", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it("starts and listens on an OS-assigned port", async () => {
    const app = createApp();
    server = serve(app, { port: 0 });

    expect(server.port).toBeGreaterThan(0);
    // Verify we can connect
    await waitForReady(server.port);
  });

  it("receives a message and sends a response", async () => {
    const app = createApp();
    app.on("ADT^A01", (ctx) => ({
      raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|${ctx.controlId}`,
    }));

    server = serve(app, { port: 0 });
    await waitForReady(server.port);

    const response = await sendMessage(server.port, SAMPLE_ADT);
    expect(response).toBeDefined();
    expect(response).toContain("MSA|AA|MSG001");
  });

  it("handles multiple messages on one connection", async () => {
    const app = createApp();
    app.on("*", (ctx) => ({
      raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|${ctx.controlId}`,
    }));

    server = serve(app, { port: 0 });
    await waitForReady(server.port);

    const client = createPersistentClient(server.port);
    try {
      const resp1 = await client.send(SAMPLE_ADT);
      expect(resp1).toBeDefined();
      expect(resp1).toContain("MSA|AA|MSG001");

      const resp2 = await client.send(SAMPLE_ORU);
      expect(resp2).toBeDefined();
      expect(resp2).toContain("MSA|AA|MSG002");
    } finally {
      client.destroy();
    }
  });

  it("sends no response when handler returns undefined", async () => {
    const app = createApp();
    // No ack middleware, handler returns undefined explicitly
    // oxlint-disable-next-line unicorn/no-useless-undefined
    app.on("ADT^A01", () => undefined);

    server = serve(app, { port: 0 });
    await waitForReady(server.port);

    const response = await sendMessage(server.port, SAMPLE_ADT, 500);
    expect(response).toBeUndefined();
  });

  it("sends no response when no handler matches", async () => {
    const app = createApp();
    // Only register handler for ORM^O01
    app.on("ORM^O01", async () => ({ raw: "should not reach" }));

    server = serve(app, { port: 0 });
    await waitForReady(server.port);

    // Send ADT^A01 which has no matching handler
    const response = await sendMessage(server.port, SAMPLE_ADT, 500);
    expect(response).toBeUndefined();
  });

  it("onError handler returns response when handler throws", async () => {
    let callCount = 0;
    const app = createApp();
    app.onError((_err, ctx) => ({
      raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AR|${ctx.controlId}`,
    }));
    app.on("*", (ctx) => {
      callCount++;
      if (callCount === 1) {
        throw new Error("intentional test error");
      }
      return {
        raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|${ctx.controlId}`,
      };
    });

    server = serve(app, { port: 0 });
    await waitForReady(server.port);

    // First message — handler throws, error handler sends AR
    const resp1 = await sendMessage(server.port, SAMPLE_ADT);
    expect(resp1).toBeDefined();
    expect(resp1).toContain("MSA|AR|MSG001");

    // Second message on a NEW connection — should still work
    const resp2 = await sendMessage(server.port, SAMPLE_ORU);
    expect(resp2).toBeDefined();
    expect(resp2).toContain("MSA|AA|MSG002");
  });

  it("unhandled error sends no response, connection stays alive", async () => {
    let callCount = 0;
    const app = createApp();
    // No onError — unhandled errors produce no response (sender retries)
    app.on("*", (ctx) => {
      callCount++;
      if (callCount === 1) {
        throw new Error("unhandled test error");
      }
      return {
        raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|${ctx.controlId}`,
      };
    });

    server = serve(app, { port: 0 });
    await waitForReady(server.port);

    const client = createPersistentClient(server.port);
    try {
      // First message — no onError, no response sent
      const resp1 = await client.send(SAMPLE_ADT, 500);
      expect(resp1).toBeUndefined();

      // Second message on SAME connection — still works
      const resp2 = await client.send(SAMPLE_ORU);
      expect(resp2).toBeDefined();
      expect(resp2).toContain("MSA|AA|MSG002");
    } finally {
      client.destroy();
    }
  });

  // ── Lifecycle callbacks ─────────────────────────────────────────────

  describe("lifecycle callbacks", () => {
    it("onConnect fires with a valid connection ID", async () => {
      const app = createApp().on("*", () => ({ raw: "ACK" }));
      const connections: number[] = [];

      server = serve(app, {
        onConnect: (conn) => {
          connections.push(conn.id);
        },
        port: 0,
      });

      // Send two messages on separate connections
      await sendMessage(server.port, SAMPLE_ADT);
      await sendMessage(server.port, SAMPLE_ORU);

      expect(connections).toHaveLength(2);
      // IDs are sequential — test relative ordering, not absolute values
      expect(connections[1]).toBeGreaterThan(connections[0]);
    });

    it("onDisconnect fires when client disconnects", async () => {
      const app = createApp().on("*", () => ({ raw: "ACK" }));
      let disconnectedId: number | undefined;

      server = serve(app, {
        onDisconnect: (conn) => {
          disconnectedId = conn.id;
        },
        port: 0,
      });

      await sendMessage(server.port, SAMPLE_ADT);
      // sendMessage destroys the client after receiving the response,
      // give a moment for the server to observe the close
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      expect(disconnectedId).toBeDefined();
      expectTypeOf(disconnectedId).toBeNumber();
    });

    it("onError fires when handler throws without app-level error handler", async () => {
      const app = createApp();
      app.on("*", () => {
        throw new Error("handler boom");
      });

      const errors: { message: string; connId: number }[] = [];

      server = serve(app, {
        onError: (err, conn) => {
          errors.push({ connId: conn.id, message: err.message });
        },
        port: 0,
      });

      // No response expected (handler threw, no error handler to produce one)
      await sendMessage(server.port, SAMPLE_ADT, 500);

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe("handler boom");
    });

    it("onError receives messageInfo with routing fields for handler errors", async () => {
      const app = createApp();
      app.on("ADT^A01", () => {
        throw new Error("handler failed");
      });

      let capturedInfo: unknown;

      server = serve(app, {
        onError: (_err, _conn, messageInfo) => {
          capturedInfo = messageInfo;
        },
        port: 0,
      });

      await sendMessage(server.port, SAMPLE_ADT, 500);

      expect(capturedInfo).toBeDefined();
      const info = capturedInfo as {
        messageType: string;
        triggerEvent: string;
        controlId: string;
        version: string;
      };
      expect(info.messageType).toBe("ADT");
      expect(info.triggerEvent).toBe("A01");
      expect(info.controlId).toBe("MSG001");
      expect(info.version).toBe("2.5.1");
    });

    it("onError receives undefined messageInfo for lifecycle callback errors", async () => {
      const app = createApp().on("*", () => ({ raw: "ACK" }));
      let capturedInfo: unknown = "sentinel";

      server = serve(app, {
        onConnect: () => {
          throw new Error("connect failed");
        },
        onError: (_err, _conn, messageInfo) => {
          capturedInfo = messageInfo;
        },
        port: 0,
      });

      await sendMessage(server.port, SAMPLE_ADT, 500);

      expect(capturedInfo).toBeUndefined();
    });

    it("onError does NOT fire when app-level error handler handles the error", async () => {
      const app = createApp();
      app.onError((_err, ctx) => ({
        raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AR|${ctx.controlId}`,
      }));
      app.on("*", () => {
        throw new Error("handled error");
      });

      const errors: string[] = [];

      server = serve(app, {
        onError: (err) => {
          errors.push(err.message);
        },
        port: 0,
      });

      const resp = await sendMessage(server.port, SAMPLE_ADT);
      expect(resp).toContain("MSA|AR|MSG001");
      expect(errors).toHaveLength(0);
    });

    it("onError fires when app-level error handler itself throws", async () => {
      const app = createApp();
      app.onError(() => {
        throw new Error("error handler exploded");
      });
      app.on("*", () => {
        throw new Error("original error");
      });

      const errors: string[] = [];

      server = serve(app, {
        onError: (err) => {
          errors.push(err.message);
        },
        port: 0,
      });

      await sendMessage(server.port, SAMPLE_ADT, 500);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBe("error handler exploded");
    });

    it("connection IDs are unique across connections", async () => {
      const app = createApp().on("*", () => ({ raw: "ACK" }));
      const ids: number[] = [];

      server = serve(app, {
        onConnect: (conn) => {
          ids.push(conn.id);
        },
        port: 0,
      });

      // Three separate connections
      await sendMessage(server.port, SAMPLE_ADT);
      await sendMessage(server.port, SAMPLE_ADT);
      await sendMessage(server.port, SAMPLE_ADT);

      expect(ids).toHaveLength(3);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it("connection state persists across messages on the same socket", async () => {
      const app = createApp();
      app.use((ctx, next) => {
        const count = (ctx.connection.state.get("count") as number) ?? 0;
        ctx.connection.state.set("count", count + 1);
        return next();
      });
      app.on("*", (ctx) => {
        const count = ctx.connection.state.get("count") as number;
        return {
          raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|${ctx.controlId}|count=${count}`,
        };
      });

      server = serve(app, { port: 0 });

      const client = createPersistentClient(server.port);
      try {
        const resp1 = await client.send(SAMPLE_ADT);
        expect(resp1).toContain("count=1");

        const resp2 = await client.send(SAMPLE_ORU);
        expect(resp2).toContain("count=2");
      } finally {
        client.destroy();
      }
    });

    it("multiple connections get separate state Maps", async () => {
      const app = createApp();
      app.use((ctx, next) => {
        const count = (ctx.connection.state.get("count") as number) ?? 0;
        ctx.connection.state.set("count", count + 1);
        return next();
      });
      app.on("*", (ctx) => {
        const count = ctx.connection.state.get("count") as number;
        return {
          raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|${ctx.controlId}|count=${count}`,
        };
      });

      server = serve(app, { port: 0 });

      // Two separate connections — each should have count=1
      const resp1 = await sendMessage(server.port, SAMPLE_ADT);
      expect(resp1).toContain("count=1");

      const resp2 = await sendMessage(server.port, SAMPLE_ORU);
      expect(resp2).toContain("count=1");
    });

    it("onConnect throwing tears down connection, onDisconnect still fires", async () => {
      const app = createApp().on("*", () => ({ raw: "ACK" }));
      let disconnectCount = 0;
      const errors: string[] = [];

      server = serve(app, {
        onConnect: () => {
          throw new Error("onConnect failed");
        },
        onDisconnect: () => {
          disconnectCount++;
        },
        onError: (err) => {
          errors.push(err.message);
        },
        port: 0,
      });

      // The connection should be torn down — no response
      const resp = await sendMessage(server.port, SAMPLE_ADT, 500);
      expect(resp).toBeUndefined();

      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBe("onConnect failed");
      expect(disconnectCount).toBe(1);
    });

    it("onDisconnect throwing is caught and routed to onError", async () => {
      const app = createApp().on("*", () => ({ raw: "ACK" }));
      const errors: string[] = [];

      server = serve(app, {
        onDisconnect: () => {
          throw new Error("onDisconnect failed");
        },
        onError: (err) => {
          errors.push(err.message);
        },
        port: 0,
      });

      await sendMessage(server.port, SAMPLE_ADT);
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBe("onDisconnect failed");
    });

    it("console.error fallback when no onError is provided", async () => {
      const app = createApp();
      app.on("*", () => {
        throw new Error("unhandled boom");
      });

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        server = serve(app, { port: 0 });

        await sendMessage(server.port, SAMPLE_ADT, 500);

        expect(consoleSpy).toHaveBeenCalledOnce();
        const msg = consoleSpy.mock.calls[0][0] as string;
        expect(msg).toContain("unhandled boom");
        expect(msg).toContain("[mllp]");
      } finally {
        consoleSpy.mockRestore();
      }
    });

    it("no callbacks = no errors (optional, zero-cost)", async () => {
      const app = createApp().on("*", (ctx) => ({
        raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|${ctx.controlId}`,
      }));

      // No onConnect/onDisconnect/onError
      server = serve(app, { port: 0 });

      const resp = await sendMessage(server.port, SAMPLE_ADT);
      expect(resp).toContain("MSA|AA|MSG001");
    });
  });

  it("graceful close — connecting after close fails", async () => {
    const app = createApp();
    server = serve(app, { port: 0 });
    const port = server.port;

    await waitForReady(port);
    await server.close();
    server = undefined; // Prevent afterEach from closing again

    await expect(
      new Promise<void>((resolve, reject) => {
        const client = net.connect({ host: "127.0.0.1", port }, () => {
          client.destroy();
          resolve();
        });
        client.on("error", (err) => {
          reject(err);
        });
      })
    ).rejects.toThrow();
  });
});
