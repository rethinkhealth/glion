/**
 * The Node runtime adapter over real sockets: the conformance
 * suites, plus what only `net.Socket` lets a test observe at the far end.
 */

import { connect as connectTcp } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { connect as connectTls } from "node:tls";

import { describe, expect, inject, it } from "vitest";

import { MllpClient } from "../../src/index";
import { DEFAULT_GRACEFUL_CLOSE_MS, nodeSocket } from "../../src/runtime/node";
import { silence } from "../answers";
import { adtA01 } from "../fixtures";
import { describeMllpClientScenarios } from "./conformance/client-scenarios";
import { describeMllpSocketContract } from "./conformance/socket-contract";
import { listen } from "./remote-tcp";
import type { Address } from "./remote-tcp";

/** Slack on top of the grace window for the destroy to be observed. */
const CLOSE_SLACK_MS = 500;

/** An address no test host has, from TEST-NET-1 (RFC 5737). */
const UNASSIGNED = "192.0.2.1";

/** Time for the remote system to observe the client's close. */
const SETTLE_MS = 50;

/** Send deadline when the remote system refuses the client certificate silently. */
const REFUSED_SEND_TIMEOUT_MS = 1000;

const { pki, tcp, tls } = inject("fixtures");

/** `nodeSocket` over TCP. */
const overTcp = ({ host, port }: Address) =>
  nodeSocket(() => connectTcp({ host, port }));

/** `nodeSocket` over TLS, trusting the test CA. */
const overTls = ({ host, port }: Address) =>
  nodeSocket(() =>
    connectTls({ ca: pki.ca, host, port, servername: pki.servername })
  );

describeMllpSocketContract("nodeSocket", overTcp, {
  closeBoundMs: DEFAULT_GRACEFUL_CLOSE_MS + CLOSE_SLACK_MS,
  remotes: tcp,
});

describeMllpClientScenarios("nodeSocket", overTcp, tcp);

describeMllpSocketContract("nodeSocket over TLS", overTls, {
  closeBoundMs: DEFAULT_GRACEFUL_CLOSE_MS + CLOSE_SLACK_MS,
  remotes: tls,
});

describeMllpClientScenarios("nodeSocket over TLS", overTls, tls);

describe("nodeSocket over net.Socket", () => {
  it("does not dial when the signal is already aborted", async () => {
    await using remote = await listen();
    const socket = overTcp(remote);

    await expect(
      socket.connect(AbortSignal.abort(new Error("the caller gave up")))
    ).rejects.toThrow();
    await sleep(SETTLE_MS);

    expect(remote.connections).toBe(0);
  });

  it("rejects with the socket's error when it fails before connecting", async () => {
    // Binding to an address the host does not have fails at once: the
    // socket emits its error just after it is created. The error's code and
    // syscall differ by OS and runtime (Node on Linux: EINVAL from bind; Bun:
    // EADDRNOTAVAIL from connect), so the test compares the error itself.
    const emitted = Promise.withResolvers<Error>();
    const socket = nodeSocket(() =>
      connectTcp({
        host: "127.0.0.1",
        localAddress: UNASSIGNED,
        port: 9,
      }).once("error", emitted.resolve)
    );

    await expect(socket.connect(new AbortController().signal)).rejects.toBe(
      await emitted.promise
    );
  });

  it("rejects a dial that returns a promise, and leaves nothing open", async () => {
    await using remote = await listen();
    const dial = async () => {
      await sleep(1);
      return connectTcp({ host: remote.host, port: remote.port });
    };
    const socket = nodeSocket(dial as never);

    await expect(socket.connect(new AbortController().signal)).rejects.toThrow(
      "`dial` returned a promise; it must return the socket."
    );
    await sleep(SETTLE_MS);

    expect(remote.closes).toHaveLength(remote.connections);
  });

  it("dials a fresh connection after close()", async () => {
    await using remote = await listen();
    const socket = overTcp(remote);

    await socket.connect(new AbortController().signal);
    await socket.close();
    await socket.connect(new AbortController().signal);
    await socket.close();

    expect(remote.connections).toBe(2);
  });

  it("ends with FIN, not RST, when close() follows an exchange", async () => {
    await using remote = await listen();
    const client = new MllpClient({ socket: overTcp(remote) });

    await client.send(adtA01().tree);
    await client.close();
    await sleep(SETTLE_MS);

    expect(remote.received).toHaveLength(1);
    expect(remote.closes).toEqual(["end"]);
  });

  it("destroys the socket after gracefulCloseMs when the remote system never answers the FIN", async () => {
    await using remote = await listen({ allowHalfOpen: true, answer: silence });
    const socket = nodeSocket(
      () => connectTcp({ host: remote.host, port: remote.port }),
      { gracefulCloseMs: 200 }
    );
    await socket.connect(new AbortController().signal);

    const started = performance.now();
    await socket.close();
    const elapsed = performance.now() - started;

    expect(elapsed).toBeGreaterThanOrEqual(180);
    expect(elapsed).toBeLessThan(200 + CLOSE_SLACK_MS);
  });
});

describe("nodeSocket over tls.TLSSocket", () => {
  const { acknowledging } = tls;

  it("rejects CONNECTION_FAILED when the certificate is not from a trusted CA", async () => {
    const client = new MllpClient({
      reconnect: false,
      socket: nodeSocket(() =>
        connectTls({ host: acknowledging.host, port: acknowledging.port })
      ),
    });

    await expect(client.send(adtA01().tree)).rejects.toMatchObject({
      cause: { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" },
      code: "CONNECTION_FAILED",
      delivery: "not-sent",
    });
  });

  it("presents the client certificate to a remote system that requires one", async () => {
    const { host, port } = tls.requiringClientCertificate;
    const client = new MllpClient({
      socket: nodeSocket(() =>
        connectTls({
          ca: pki.ca,
          cert: pki.cert,
          host,
          key: pki.key,
          port,
          servername: pki.servername,
        })
      ),
    });

    await expect(client.send(adtA01().tree)).resolves.toMatchObject({
      code: "AA",
    });
    await client.close();
  });

  it("fails the first send, delivery unknown, when the remote system requires a client certificate and none is given", async () => {
    const client = new MllpClient({
      reconnect: false,
      sendTimeoutMs: REFUSED_SEND_TIMEOUT_MS,
      socket: overTls(tls.requiringClientCertificate),
    });
    await client.connect();

    await expect(client.send(adtA01().tree)).rejects.toMatchObject({
      code: "CONNECTION_LOST",
      delivery: "unknown",
    });
  });

  it("ends with FIN, not RST, when close() follows an exchange", async () => {
    await using remote = await listen({
      tls: { cert: pki.serverCert, key: pki.serverKey },
    });
    const client = new MllpClient({ socket: overTls(remote) });

    await client.send(adtA01().tree);
    await client.close();
    await sleep(SETTLE_MS);

    expect(remote.closes).toEqual(["end"]);
  });
});
