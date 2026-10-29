// oxlint-disable require-await
// oxlint-disable no-empty-function
// oxlint-disable promise/avoid-new
import { once } from "node:events";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import tls from "node:tls";

import { parseHL7v2 } from "@glion/hl7v2";
import { CR, frame, FS } from "@glion/mllp-codec";
import { encodeBytes } from "@glion/util-charset";
import { generate } from "selfsigned";

import { MllpServerErrorCode } from "../../src/errors";
import { serve } from "../../src/node/serve";
import type { ConnectionInfo, NodeEnv, Server } from "../../src/node/serve";
import { Mllp } from "../../src/server/mllp";

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
      client.write(frame(encodeBytes(message)));
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
        combined.at(-2) === FS &&
        combined.at(-1) === CR
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
          combined.at(-2) === FS &&
          combined.at(-1) === CR
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

      client.write(frame(encodeBytes(message)));
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

/** X.509 GeneralName tag for a DNS name (RFC 5280 §4.2.1.6). */
const DNS_NAME = 2;

function createApp() {
  return new Mllp<NodeEnv>().parser(parseHL7v2);
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
    server = serve({ handle: app.handle, port: 0 });

    expect(server.port).toBeGreaterThan(0);
    // Verify we can connect
    await waitForReady(server.port);
  });

  it("receives a message and sends a response", async () => {
    const app = createApp();
    app.on("ADT^A01", (ctx) => ({
      raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|${ctx.controlId}`,
    }));

    server = serve({ handle: app.handle, port: 0 });
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

    server = serve({ handle: app.handle, port: 0 });
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

    server = serve({ handle: app.handle, port: 0 });
    await waitForReady(server.port);

    const response = await sendMessage(server.port, SAMPLE_ADT, 500);
    expect(response).toBeUndefined();
  });

  it("sends no response when no handler matches", async () => {
    const app = createApp();
    // Only register handler for ORM^O01
    app.on("ORM^O01", async () => ({ raw: "should not reach" }));

    server = serve({ handle: app.handle, port: 0 });
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

    server = serve({ handle: app.handle, port: 0 });
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

    server = serve({ handle: app.handle, port: 0 });
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

  it("answers every message a remote system sent before closing its side", async () => {
    const app = createApp().on("*", async (ctx) => {
      await delay(20);
      return {
        raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|${ctx.controlId}`,
      };
    });
    server = serve({ handle: app.handle, port: 0 });
    await server.listening;

    const client = net.connect({
      allowHalfOpen: true,
      host: "127.0.0.1",
      port: server.port,
    });
    const chunks: Buffer[] = [];
    client.on("data", (chunk: Buffer) => chunks.push(chunk));
    client.write(frame(encodeBytes(SAMPLE_ADT)));
    client.write(frame(encodeBytes(SAMPLE_ORU)));
    client.end();
    await once(client, "end");

    const replies = Buffer.concat(chunks).toString("utf8");
    expect(replies).toContain("\rMSA|AA|MSG001");
    expect(replies).toContain("\rMSA|AA|MSG002");
  });

  it("closes a connection that dropped while its message was being handled", async () => {
    // The idle timeout destroys the server's socket while the route handler
    // runs, so the response is written to a destroyed socket.
    const app = createApp().on("*", async (ctx) => {
      await delay(150);
      return {
        raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|${ctx.controlId}`,
      };
    });
    const disconnected = Promise.withResolvers<ConnectionInfo>();
    server = serve({
      handle: app.handle,
      onDisconnect: disconnected.resolve,
      port: 0,
      socketTimeout: 50,
    });
    await server.listening;

    const client = net.connect({ host: "127.0.0.1", port: server.port });
    client.on("error", () => {});
    client.write(frame(encodeBytes(SAMPLE_ADT)));

    await disconnected.promise;
    client.destroy();
  });

  it("reports nothing when the remote system resets the connection in the middle of a message", async () => {
    const app = createApp().on("*", () => ({ raw: "ACK" }));
    const errors: Error[] = [];
    const disconnected = Promise.withResolvers<ConnectionInfo>();
    server = serve({
      handle: app.handle,
      onDisconnect: disconnected.resolve,
      onError: (error) => {
        errors.push(error);
      },
      port: 0,
    });
    await server.listening;

    const client = net.connect({ host: "127.0.0.1", port: server.port });
    client.on("error", () => {});
    await once(client, "connect");
    // A VT and the message, with no FS CR yet.
    client.write(frame(encodeBytes(SAMPLE_ADT)).subarray(0, -2));
    await delay(50);
    client.resetAndDestroy();

    await disconnected.promise;
    expect(errors).toEqual([]);
  });

  it("ends a connection whose onConnect is still running when the server closes", async () => {
    const app = createApp();
    const connecting = Promise.withResolvers<null>();
    const release = Promise.withResolvers<null>();
    const running = serve({
      handle: app.handle,
      onConnect: async () => {
        connecting.resolve(null);
        await release.promise;
      },
      port: 0,
    });
    await running.listening;

    const client = net.connect({ host: "127.0.0.1", port: running.port });
    client.on("error", () => {});
    await connecting.promise;
    const ended = once(client, "end").then(() => "ended");
    const closed = running.close();

    await expect(
      Promise.race([ended, delay(500).then(() => "still open")])
    ).resolves.toBe("ended");
    release.resolve(null);
    await closed;
    client.destroy();
  });

  it("throws INVALID_OPTION when the port is not a TCP port", () => {
    const app = createApp();
    const options = { handle: app.handle, port: Number.NaN };

    expect(() => serve(options)).toThrow(
      expect.objectContaining({
        code: MllpServerErrorCode.INVALID_OPTION,
        option: "port",
      })
    );
  });

  it("throws INVALID_OPTION when called with the app and options", () => {
    const app = createApp();
    // The call shape before `handle` was an option, made from JavaScript.
    const call = serve as unknown as (...args: unknown[]) => Server;

    expect(() => call(app, { port: 2575 })).toThrow(
      expect.objectContaining({
        code: MllpServerErrorCode.INVALID_OPTION,
        message:
          "The options given to `serve()` are an app; `serve()` takes one options object, as in `serve({ handle: app.handle, port: 2575 })`.",
        option: "options",
      })
    );
  });

  it("throws INVALID_OPTION when handle is not a function", () => {
    const call = serve as unknown as (...args: unknown[]) => Server;

    expect(() => call({ port: 2575 })).toThrow(
      "The `handle` option is not a function; `serve()` replies to each message with the `handle` it is given, as in `serve({ handle: app.handle, port: 2575 })`."
    );
  });

  // ── Lifecycle callbacks ─────────────────────────────────────────────

  describe("lifecycle callbacks", () => {
    it("onConnect fires with a valid connection ID", async () => {
      const app = createApp().on("*", () => ({ raw: "ACK" }));
      const connections: number[] = [];

      server = serve({
        handle: app.handle,
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
      expect(connections[1]).toBeGreaterThan(connections[0] as number);
    });

    it("onDisconnect fires when client disconnects", async () => {
      const app = createApp().on("*", () => ({ raw: "ACK" }));
      let disconnectedId: number | undefined;

      server = serve({
        handle: app.handle,
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
      expect(disconnectedId).toBeTypeOf("number");
    });

    it("onError fires when handler throws without app-level error handler", async () => {
      const app = createApp();
      app.on("*", () => {
        throw new Error("handler boom");
      });

      const errors: { message: string; connId: number }[] = [];

      server = serve({
        handle: app.handle,
        onError: (err, conn) => {
          errors.push({ connId: conn.id, message: err.message });
        },
        port: 0,
      });

      // No response expected (handler threw, no error handler to produce one)
      await sendMessage(server.port, SAMPLE_ADT, 500);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toBe("handler boom");
    });

    it("onError fires with PROTOCOL_VIOLATION when the inbound byte stream violates MLLP framing", async () => {
      const app = createApp();
      app.on("*", (ctx) => ({
        raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|${ctx.controlId}`,
      }));

      const errors: { code?: string; causeName?: string }[] = [];
      server = serve({
        handle: app.handle,
        onError: (err) => {
          const e = err as Error & { code?: string; cause?: Error };
          errors.push({ causeName: e.cause?.name, code: e.code });
        },
        port: 0,
      });
      const port = server.port;
      await waitForReady(port);

      // Bytes outside any MLLP message: no VT start block. The codec errors,
      // the server reports it, and the connection closes.
      await new Promise<void>((resolve, reject) => {
        const client = net.connect({ host: "127.0.0.1", port }, () => {
          client.write(Buffer.from("garbage outside a frame"));
        });
        const timer = setTimeout(() => {
          client.destroy();
          reject(new Error("server did not close the violating connection"));
        }, 2000);
        client.on("close", () => {
          clearTimeout(timer);
          resolve();
        });
        client.on("error", () => {
          /* reset by server is fine — close still fires */
        });
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.code).toBe("PROTOCOL_VIOLATION");
      expect(errors[0]?.causeName).toBe("MllpCodecError");
    });

    it("onError fires with PROTOCOL_VIOLATION when a handler response contains a reserved byte", async () => {
      const app = createApp();
      // The response carries a VT (0x0B): it cannot be framed for the wire.
      app.on("*", () => ({
        raw: "MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|\u000Bbad",
      }));

      const errors: { code?: string }[] = [];
      server = serve({
        handle: app.handle,
        onError: (err) => {
          errors.push({ code: (err as Error & { code?: string }).code });
        },
        port: 0,
      });

      const response = await sendMessage(server.port, SAMPLE_ADT, 500);
      expect(response).toBeUndefined();
      expect(errors).toHaveLength(1);
      expect(errors[0]?.code).toBe("PROTOCOL_VIOLATION");
    });

    it("onError receives messageInfo with routing fields for handler errors", async () => {
      const app = createApp();
      app.on("ADT^A01", () => {
        throw new Error("handler failed");
      });

      let capturedInfo: unknown;

      server = serve({
        handle: app.handle,
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

      server = serve({
        handle: app.handle,
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

      server = serve({
        handle: app.handle,
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

      server = serve({
        handle: app.handle,
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

      server = serve({
        handle: app.handle,
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
        const count = (ctx.env.connection.state.get("count") as number) ?? 0;
        ctx.env.connection.state.set("count", count + 1);
        return next();
      });
      app.on("*", (ctx) => {
        const count = ctx.env.connection.state.get("count") as number;
        return {
          raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|${ctx.controlId}|count=${count}`,
        };
      });

      server = serve({ handle: app.handle, port: 0 });

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
        const count = (ctx.env.connection.state.get("count") as number) ?? 0;
        ctx.env.connection.state.set("count", count + 1);
        return next();
      });
      app.on("*", (ctx) => {
        const count = ctx.env.connection.state.get("count") as number;
        return {
          raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|${ctx.controlId}|count=${count}`,
        };
      });

      server = serve({ handle: app.handle, port: 0 });

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

      server = serve({
        handle: app.handle,
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

      server = serve({
        handle: app.handle,
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
        server = serve({ handle: app.handle, port: 0 });

        await sendMessage(server.port, SAMPLE_ADT, 500);

        expect(consoleSpy).toHaveBeenCalledOnce();
        const msg = consoleSpy.mock.calls[0]?.[0] as string;
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
      server = serve({ handle: app.handle, port: 0 });

      const resp = await sendMessage(server.port, SAMPLE_ADT);
      expect(resp).toContain("MSA|AA|MSG001");
    });
  });

  describe("maxConnections", () => {
    const ACK = "MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|MSG001";

    it("closes a connection past the limit before reading from it, and keeps the open one", async () => {
      const app = createApp().on("ADT^A01", () => ({ raw: ACK }));
      const connected: number[] = [];
      server = serve({
        handle: app.handle,
        maxConnections: 1,
        onConnect: ({ id }) => {
          connected.push(id);
        },
        port: 0,
      });
      await server.listening;

      // The first connection takes the only slot.
      const open = createPersistentClient(server.port);
      expect(await open.send(SAMPLE_ADT)).toBe(ACK);

      // The second is accepted by the OS, then closed by the server before
      // any byte is read from it or written to it. Its message is still
      // unread in the server's receive buffer, so the close arrives as a
      // reset.
      const refused = net.connect({ host: "127.0.0.1", port: server.port });
      const received: Buffer[] = [];
      refused.on("data", (chunk: Buffer) => received.push(chunk));
      refused.on("error", () => {});
      refused.write(frame(encodeBytes(SAMPLE_ADT)));
      // `once()` would reject on the reset; the close follows it either way.
      await new Promise((resolve) => {
        refused.once("close", resolve);
      });

      expect(received).toEqual([]);
      expect(connected).toHaveLength(1);
      expect(await open.send(SAMPLE_ADT)).toBe(ACK);
      open.destroy();
    });

    it("closes a TLS connection past the limit before its handshake", async () => {
      const pem = await generate([{ name: "commonName", value: "localhost" }], {
        algorithm: "sha256",
        extensions: [
          {
            altNames: [{ type: DNS_NAME, value: "localhost" }],
            name: "subjectAltName",
          },
        ],
      });
      const app = createApp().on("ADT^A01", () => ({ raw: ACK }));
      server = serve({
        handle: app.handle,
        maxConnections: 1,
        port: 0,
        tls: { cert: pem.cert, key: pem.private },
      });
      await server.listening;
      const dial = () =>
        tls.connect({
          ca: pem.cert,
          host: "127.0.0.1",
          port: server?.port,
          servername: "localhost",
        });

      const open = dial();
      await once(open, "secureConnect");
      open.write(frame(encodeBytes(SAMPLE_ADT)));
      await once(open, "data");

      const refused = dial();
      await expect(once(refused, "secureConnect")).rejects.toThrow();

      open.write(frame(encodeBytes(SAMPLE_ADT)));
      const [reply] = (await once(open, "data")) as [Buffer];
      expect(reply).toEqual(Buffer.from(frame(encodeBytes(ACK))));
      open.destroy();
    });
  });

  it("graceful close — connecting after close fails", async () => {
    const app = createApp();
    server = serve({ handle: app.handle, port: 0 });
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
