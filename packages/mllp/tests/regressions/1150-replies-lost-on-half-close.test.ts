/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1150.
 *
 * Date: 2026-10-29
 * Symptom: a remote system that sent its messages and then closed its side
 * of the connection got no reply to a message still being handled.
 * Cause: Node's `net.Server` defaults to `allowHalfOpen: false`, so the
 * remote system's FIN ended the server's side too, and every reply not yet
 * written was lost.
 * Resolution: the server listens with `allowHalfOpen: true`, which a
 * caller's `tls` options cannot turn off, and closes its side once every
 * message is answered.
 */

import { once } from "node:events";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

import { parseHL7v2 } from "@glion/hl7v2";
import { frame } from "@glion/mllp-codec";
import { encodeBytes } from "@glion/util-charset";
import { afterEach, describe, expect, it } from "vitest";

import { serve } from "../../src/node/serve";
import type { Server } from "../../src/node/serve";
import { Mllp } from "../../src/server/mllp";

const ADT_A01 =
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1";

const ORU_R01 = "MSH|^~\\&|Lab|Fac|App|Fac|20240101||ORU^R01|MSG002|P|2.5.1";

describe("a remote system that closes its side after sending", () => {
  let server: Server | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("gets a reply to every message it sent", async () => {
    const app = new Mllp().parser(parseHL7v2).on("*", async (ctx) => {
      await delay(20);
      return {
        raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|${ctx.controlId}`,
      };
    });
    server = serve({ handle: app.handle, port: 0 });
    await server.listening;

    const remote = net.connect({
      allowHalfOpen: true,
      host: "127.0.0.1",
      port: server.port,
    });
    const chunks: Buffer[] = [];
    remote.on("data", (chunk: Buffer) => chunks.push(chunk));
    remote.write(frame(encodeBytes(ADT_A01)));
    remote.write(frame(encodeBytes(ORU_R01)));
    remote.end();
    await once(remote, "end");

    const replies = Buffer.concat(chunks).toString("utf8");
    expect(replies).toContain("\rMSA|AA|MSG001");
    expect(replies).toContain("\rMSA|AA|MSG002");
  });
});
