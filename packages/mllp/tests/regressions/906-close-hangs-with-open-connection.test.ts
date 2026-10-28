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
 * is handling, if any, has been answered, and destroys a connection whose
 * remote system does not close its side within a grace period.
 */

import { once } from "node:events";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import tls from "node:tls";

import { parseHL7v2 } from "@glion/hl7v2";
import { frame } from "@glion/mllp-codec";
import { encodeBytes } from "@glion/util-charset";
import { generate } from "selfsigned";
import { afterEach, describe, expect, it } from "vitest";

import { serve } from "../../src/node/serve";
import type { ConnectionInfo } from "../../src/node/serve";
import { Mllp } from "../../src/server/mllp";

const ADT_A01 =
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1";

const ACK =
  "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240101120000||ACK|ACK001|P|2.5.1\rMSA|AA|MSG001";

/** X.509 GeneralName tag for a DNS name (RFC 5280 §4.2.1.6). */
const DNS_NAME = 2;

describe("server.close()", () => {
  const remotes: net.Socket[] = [];

  afterEach(() => {
    // A close() that hangs in a failing test is released here.
    for (const remote of remotes.splice(0)) {
      remote.destroy();
    }
  });

  const connect = async (
    port: number,
    options?: { allowHalfOpen: boolean }
  ) => {
    const remote = net.connect({ host: "127.0.0.1", port, ...options });
    remotes.push(remote);
    await once(remote, "connect");
    return remote;
  };

  it("resolves while a remote system holds an idle connection open", async () => {
    const app = new Mllp().parser(parseHL7v2);
    const accepted = Promise.withResolvers<ConnectionInfo>();
    const server = serve({
      handle: app.handle,
      onConnect: accepted.resolve,
      port: 0,
    });
    await server.listening;

    // The remote system connects and sends nothing: the server sits in its
    // read, which is where #906 hung.
    const remote = await connect(server.port);
    await accepted.promise;
    const remoteClosed = once(remote, "close");

    // close() ends the connection with a FIN; the remote system answers
    // with its own, so both sides close.
    await server.close();
    await remoteClosed;
  });

  it("resolves once a connection that has answered a message is idle again", async () => {
    const app = new Mllp()
      .parser(parseHL7v2)
      .on("ADT^A01", () => ({ raw: ACK }));
    const server = serve({ handle: app.handle, port: 0 });
    await server.listening;

    // One full exchange: the message goes out, its ACK comes back, and the
    // server is back in its read, waiting for the next message. This is the
    // state of every connection that has carried traffic.
    const remote = await connect(server.port);
    const remoteClosed = once(remote, "close");
    remote.write(frame(encodeBytes(ADT_A01)));
    await once(remote, "data");

    await server.close();
    await remoteClosed;
  });

  it("answers the message in progress before ending its connection", async () => {
    // The handler signals `handling` when it starts, then waits for the test
    // to release `answer`, so the test can call close() mid-message.
    const handling = Promise.withResolvers<true>();
    const answer = Promise.withResolvers<true>();
    const app = new Mllp().parser(parseHL7v2).on("ADT^A01", async () => {
      handling.resolve(true);
      await answer.promise;
      return { raw: ACK };
    });
    const server = serve({ handle: app.handle, port: 0 });
    await server.listening;

    const remote = await connect(server.port);
    const received: Buffer[] = [];
    remote.on("data", (chunk: Buffer) => received.push(chunk));
    const remoteClosed = once(remote, "close");

    // 1. The message is sent, and the handler is now holding it.
    remote.write(frame(encodeBytes(ADT_A01)));
    await handling.promise;

    // 2. close() is called while the message is in progress. It cannot end
    //    the connection yet, so it marks it as ending and waits.
    const closed = server.close();

    // 3. The handler returns its ACK. The server writes it, sees the
    //    connection is ending, and ends it instead of reading again.
    answer.resolve(true);
    await closed;
    await remoteClosed;

    // The remote system got its ACK, and nothing else, before the close: it
    // will not resend a message the server already processed.
    expect(Buffer.concat(received)).toEqual(
      Buffer.from(frame(encodeBytes(ACK)))
    );
  });

  it("destroys a connection whose remote system never closes its side", async () => {
    const app = new Mllp().parser(parseHL7v2);
    const accepted = Promise.withResolvers<ConnectionInfo>();
    const server = serve({
      handle: app.handle,
      onConnect: accepted.resolve,
      port: 0,
    });
    await server.listening;

    // `allowHalfOpen` keeps the remote's side open after it receives the
    // server's FIN, as a remote system that never closes would.
    const remote = await connect(server.port, { allowHalfOpen: true });
    await accepted.promise;
    const remoteEnded = once(remote, "end");

    // The FIN arrives, nothing answers it, and the server destroys the
    // socket after its grace period, so close() still resolves.
    await server.close();
    await remoteEnded;
  });

  it("resolves only once onDisconnect has settled", async () => {
    const order: string[] = [];
    const app = new Mllp().parser(parseHL7v2);
    const accepted = Promise.withResolvers<ConnectionInfo>();
    const server = serve({
      handle: app.handle,
      onConnect: accepted.resolve,
      // An audit write that outlives the socket: the socket has closed
      // before this resolves.
      onDisconnect: async () => {
        await delay(20);
        order.push("onDisconnect");
      },
      port: 0,
    });
    await server.listening;

    await connect(server.port);
    await accepted.promise;

    await server.close();
    order.push("closed");

    expect(order).toEqual(["onDisconnect", "closed"]);
  });

  it("ends a TLS connection whose handshake completes after close() started", async () => {
    const pem = await generate([{ name: "commonName", value: "localhost" }], {
      algorithm: "sha256",
      extensions: [
        {
          altNames: [{ type: DNS_NAME, value: "localhost" }],
          name: "subjectAltName",
        },
      ],
    });
    const connections: ConnectionInfo[] = [];
    const app = new Mllp().parser(parseHL7v2);
    const server = serve({
      handle: app.handle,
      onConnect: (connection) => {
        connections.push(connection);
      },
      port: 0,
      tls: { cert: pem.cert, key: pem.private },
    });
    await server.listening;

    // 1. The TCP connection opens, but the TLS handshake has not started, so
    //    the server holds a socket the app has not seen yet. The pause lets
    //    Node accept it.
    const raw = await connect(server.port);
    await delay(50);

    // 2. close() starts while the handshake is still to come.
    const closed = server.close();

    // 3. The handshake completes after close() started. The server ends the
    //    connection at once, and the app never sees it.
    const remote = tls.connect({
      ca: pem.cert,
      servername: "localhost",
      socket: raw,
    });
    remotes.push(remote);
    remote.resume();
    const remoteClosed = once(remote, "close");
    await once(remote, "secureConnect");

    await closed;
    await remoteClosed;
    expect(connections).toEqual([]);
  });
});
