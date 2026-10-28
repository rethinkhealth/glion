/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1151.
 *
 * Date: 2026-10-29
 * Symptom: when a connection was torn down while its reply was being written
 * (a reset, or `socketTimeout` destroying it), the connection never closed,
 * `onDisconnect` never fired, and `server.close()` never resolved.
 * Cause: a write that returned `false` waited on the socket's `drain` event,
 * which never comes for a destroyed socket.
 * Resolution: a write resolves once the socket turns out to be torn down,
 * including on Bun, which never calls back a write still pending at a reset,
 * and the connection then ends.
 */

import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

import { frame } from "@glion/mllp-codec";
import { encodeBytes } from "@glion/util-charset";
import { describe, expect, it } from "vitest";

import { serve } from "../../src/node/serve";
import type { ConnectionInfo } from "../../src/node/serve";
import { Mllp } from "../../src/server/mllp";

const ADT_A01 =
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1";

describe("a connection torn down while its message is being handled", () => {
  it("closes, and the server then closes", async () => {
    // The idle timeout destroys the server's socket while the route handler
    // runs, so the response is written to a destroyed socket.
    const app = new Mllp().on("*", async (ctx) => {
      await delay(150);
      return {
        raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|${ctx.req.header.controlId}`,
      };
    });
    const disconnected = Promise.withResolvers<ConnectionInfo>();
    const server = serve({
      handle: app.handle,
      onDisconnect: disconnected.resolve,
      port: 0,
      socketTimeout: 50,
    });
    await server.listening;

    const remote = net.connect({ host: "127.0.0.1", port: server.port });
    remote.on("error", () => {});
    remote.write(frame(encodeBytes(ADT_A01)));

    await expect(disconnected.promise).resolves.toBeDefined();
    await server.close();
    remote.destroy();
  });
});
