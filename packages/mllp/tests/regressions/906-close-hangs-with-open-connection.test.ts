/**
 * Regression for https://github.com/rethinkhealth/glion/issues/906.
 *
 * Date: 2026-10-07
 * Symptom: `server.close()` never resolved while a remote system held its
 * connection open, so the CLI's SIGTERM shutdown hung for as long as any
 * trading partner stayed connected.
 * Cause: `close()` only stopped the listener. Node's `net.Server` resolves
 * `close()` once every connection has ended, and an MLLP connection is
 * persistent: the remote system keeps it open between messages.
 * Resolution: `close()` also ends every open connection, after the message it
 * is handling, if any, has been answered.
 */

import { once } from "node:events";
import net from "node:net";

import { parseHL7v2 } from "@glion/hl7v2";
import { frame } from "@glion/mllp-codec";
import { encodeBytes } from "@glion/util-charset";
import { describe, expect, it } from "vitest";

import { serve } from "../../src/node/serve";
import { Mllp } from "../../src/server/mllp";
import type { ConnectionInfo } from "../../src/server/types";

const ADT_A01 =
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1";

const ACK =
  "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240101120000||ACK|ACK001|P|2.5.1\rMSA|AA|MSG001";

describe("server.close()", () => {
  it("resolves while a remote system holds an idle connection open", async () => {
    const app = new Mllp().parser(parseHL7v2);
    const accepted = Promise.withResolvers<ConnectionInfo>();
    const server = serve(app, { onConnect: accepted.resolve, port: 0 });
    await server.listening;

    const remote = net.connect({ host: "127.0.0.1", port: server.port });
    await accepted.promise;
    const remoteClosed = once(remote, "close");

    await server.close();

    await remoteClosed;
    expect(remote.destroyed).toBe(true);
  });

  it("answers the message in progress before ending its connection", async () => {
    const handling = Promise.withResolvers<true>();
    const answer = Promise.withResolvers<true>();
    const app = new Mllp().parser(parseHL7v2).on("ADT^A01", async () => {
      handling.resolve(true);
      await answer.promise;
      return { raw: ACK };
    });
    const server = serve(app, { port: 0 });
    await server.listening;

    const remote = net.connect({ host: "127.0.0.1", port: server.port });
    await once(remote, "connect");
    const received: Buffer[] = [];
    remote.on("data", (chunk: Buffer) => received.push(chunk));
    const remoteClosed = once(remote, "close");
    remote.write(frame(encodeBytes(ADT_A01)));
    await handling.promise;

    const closed = server.close();
    answer.resolve(true);
    await closed;
    await remoteClosed;

    expect(Buffer.concat(received)).toEqual(
      Buffer.from(frame(encodeBytes(ACK)))
    );
  });
});
