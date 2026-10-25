import { once } from "node:events";
import { Socket as NetSocket, createServer as createTcpServer } from "node:net";
import type { AddressInfo, Server, Socket } from "node:net";
import { createServer } from "node:tls";
import type { TLSSocket } from "node:tls";

import { generate } from "selfsigned";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { SendArgs } from "../../src/commands/send";
import { dialTarget, resolveTarget } from "../../src/commands/send-target";
import { issue, SERVERNAME } from "../fixtures/pki";
import type { Pki } from "../fixtures/pki";

/** X.509 GeneralName tag for an IP address (RFC 5280 §4.2.1.6). */
const IP_ADDRESS = 7;

function args(overrides: Partial<SendArgs> = {}): SendArgs {
  return { help: false, json: false, ...overrides };
}

describe("resolveTarget", () => {
  it("returns the host and port the invocation names", () => {
    const result = resolveTarget(args({ host: "h.test", port: 1234 }));
    expect(result).toEqual({ host: "h.test", ok: true, port: 1234 });
  });

  it("sends to the MLLP port when the invocation names no port", () => {
    const result = resolveTarget(args({ host: "h.test" }));
    expect(result).toEqual({ host: "h.test", ok: true, port: 2575 });
  });

  it("states that the host is not defined, whether or not --port is given", () => {
    for (const given of [args({ port: 1234 }), args()]) {
      const result = resolveTarget(given);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("No target host is defined.");
        expect(result.hint).toBe("Pass `--host` with the system to send to.");
      }
    }
  });
});

describe("dialTarget", () => {
  const servers: Server[] = [];
  const sockets: Socket[] = [];
  let pki: Pki;
  /** A self-signed server certificate that lists `127.0.0.1`. */
  let loopback: Awaited<ReturnType<typeof generate>>;

  beforeAll(async () => {
    [pki, loopback] = await Promise.all([
      issue(),
      generate([{ name: "commonName", value: "127.0.0.1" }], {
        algorithm: "sha256",
        extensions: [
          {
            altNames: [{ ip: "127.0.0.1", type: IP_ADDRESS }],
            name: "subjectAltName",
          },
          { name: "extKeyUsage", serverAuth: true },
        ],
      }),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const socket of sockets.splice(0)) {
      socket.destroy();
    }
    for (const server of servers.splice(0)) {
      server.close();
    }
  });

  /** A TLS server on `host`, with `cert` and its private `key`. */
  async function listen(
    host: string,
    cert: string,
    key: string
  ): Promise<Server> {
    const server = createServer({ cert, key });
    servers.push(server);
    server.listen(0, host);
    await once(server, "listening");
    return server;
  }

  it("dials plain TCP when no TLS is given", async () => {
    const server = createTcpServer();
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    const accepted = once(server, "connection");

    const local = dialTarget({ host: "127.0.0.1", port });
    sockets.push(local);
    const [[remote]] = (await Promise.all([
      accepted,
      once(local, "connect"),
    ])) as [[Socket], unknown[]];
    sockets.push(remote);

    expect("encrypted" in local).toBe(false);
  });

  it("turns Nagle's algorithm off, over plain TCP and over TLS", async () => {
    const tcp = createTcpServer();
    servers.push(tcp);
    tcp.listen(0, "127.0.0.1");
    await once(tcp, "listening");
    const tls = await listen(
      "127.0.0.1",
      pki.selfSignedCert,
      pki.selfSignedKey
    );
    // A `tls.TLSSocket` is a `net.Socket`, so one spy sees both.
    const setNoDelay = vi.spyOn(NetSocket.prototype, "setNoDelay");

    const plain = dialTarget({
      host: "127.0.0.1",
      port: (tcp.address() as AddressInfo).port,
    });
    const secure = dialTarget(
      { host: SERVERNAME, port: (tls.address() as AddressInfo).port },
      { ca: pki.selfSignedCert }
    );
    sockets.push(plain, secure);
    await Promise.all([once(plain, "connect"), once(secure, "secureConnect")]);

    expect(setNoDelay.mock.calls).toEqual([[true], [true]]);
  });

  it("sends the host as the TLS server name", async () => {
    // Bound to 127.0.0.1, not `localhost`: where `localhost` resolves to both
    // ::1 and 127.0.0.1, Node may listen on one and dial the other.
    const server = await listen(
      "127.0.0.1",
      pki.selfSignedCert,
      pki.selfSignedKey
    );
    const { port } = server.address() as AddressInfo;
    const accepted = once(server, "secureConnection");

    const local = dialTarget(
      { host: SERVERNAME, port },
      { ca: pki.selfSignedCert }
    ) as TLSSocket;
    sockets.push(local);
    const [[remote]] = (await Promise.all([
      accepted,
      once(local, "secureConnect"),
    ])) as [[TLSSocket], unknown[]];
    sockets.push(remote);

    expect(remote.servername).toBe(SERVERNAME);
  });

  it("sends no server name when the host is an IP address", async () => {
    const server = await listen("127.0.0.1", loopback.cert, loopback.private);
    const { port } = server.address() as AddressInfo;
    const accepted = once(server, "secureConnection");

    const local = dialTarget(
      { host: "127.0.0.1", port },
      { ca: loopback.cert }
    ) as TLSSocket;
    sockets.push(local);
    const [[remote]] = (await Promise.all([
      accepted,
      once(local, "secureConnect"),
    ])) as [[TLSSocket], unknown[]];
    sockets.push(remote);

    // Each runtime spells "no server name" its own way: `false` on Node,
    // `undefined` on Bun, `null` on Deno.
    expect(remote.servername).toBeFalsy();
  });
});
