/**
 * The Node runtime adapter over real sockets: the conformance
 * suites, plus what only `net.Socket` lets a test observe at the far end.
 */

import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, inject, it } from "vitest";

import { MllpClient } from "../../src/index";
import { DEFAULT_GRACEFUL_CLOSE_MS, nodeSocket } from "../../src/runtime/node";
import { adtA01 } from "../fixtures";
import { silence } from "../remote";
import { describeMllpClientScenarios } from "./conformance/client-scenarios";
import { describeMllpSocketContract } from "./conformance/socket-contract";
import { listen } from "./remote-tcp";
import type { Address } from "./remote-tcp";

/** Slack on top of the grace window for the destroy to be observed. */
const CLOSE_SLACK_MS = 500;

/** Time for the remote system to observe the client's close. */
const SETTLE_MS = 50;

/** Send deadline when the remote system refuses the client certificate silently. */
const REFUSED_SEND_TIMEOUT_MS = 1000;

const pki = inject("pki");

/** `nodeSocket` over TLS, trusting the test CA. */
const overTls = (address: Address) =>
  nodeSocket({
    ...address,
    tls: { ca: pki.ca, servername: pki.servername },
  });

describeMllpSocketContract("nodeSocket", nodeSocket, {
  closeBoundMs: DEFAULT_GRACEFUL_CLOSE_MS + CLOSE_SLACK_MS,
  remotes: inject("remotes"),
});

describeMllpClientScenarios("nodeSocket", nodeSocket, inject("remotes"));

describeMllpSocketContract("nodeSocket over TLS", overTls, {
  closeBoundMs: DEFAULT_GRACEFUL_CLOSE_MS + CLOSE_SLACK_MS,
  remotes: inject("remotesOverTls"),
});

describeMllpClientScenarios(
  "nodeSocket over TLS",
  overTls,
  inject("remotesOverTls")
);

describe("nodeSocket over net.Socket", () => {
  it("does not dial when the signal is already aborted", async () => {
    await using remote = await listen();
    const socket = nodeSocket(remote);

    await expect(
      socket.connect(AbortSignal.abort(new Error("the caller gave up")))
    ).rejects.toThrow();
    await sleep(SETTLE_MS);

    expect(remote.connections).toBe(0);
  });

  it("dials a fresh connection after close()", async () => {
    await using remote = await listen();
    const socket = nodeSocket(remote);

    await socket.connect(new AbortController().signal);
    await socket.close();
    await socket.connect(new AbortController().signal);
    await socket.close();

    expect(remote.connections).toBe(2);
  });

  it("ends with FIN, not RST, when close() follows an exchange", async () => {
    await using remote = await listen();
    const client = new MllpClient({ socket: nodeSocket(remote) });

    await client.send(adtA01().tree);
    await client.close();
    await sleep(SETTLE_MS);

    expect(remote.received).toHaveLength(1);
    expect(remote.closes).toEqual(["end"]);
  });

  it("destroys the socket after gracefulCloseMs when the remote system never answers the FIN", async () => {
    await using remote = await listen({ allowHalfOpen: true, answer: silence });
    const socket = nodeSocket({ ...remote, gracefulCloseMs: 200 });
    await socket.connect(new AbortController().signal);

    const started = performance.now();
    await socket.close();
    const elapsed = performance.now() - started;

    expect(elapsed).toBeGreaterThanOrEqual(180);
    expect(elapsed).toBeLessThan(200 + CLOSE_SLACK_MS);
  });
});

describe("nodeSocket over tls.TLSSocket", () => {
  const { acknowledging } = inject("remotesOverTls");

  it("rejects CONNECTION_FAILED when the certificate is not from a trusted CA", async () => {
    const client = new MllpClient({
      reconnect: false,
      socket: nodeSocket({ ...acknowledging, tls: true }),
    });

    await expect(client.send(adtA01().tree)).rejects.toMatchObject({
      cause: { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" },
      code: "CONNECTION_FAILED",
      delivery: "not-sent",
    });
  });

  it("rejects CONNECTION_FAILED when the certificate does not list the host", async () => {
    const client = new MllpClient({
      reconnect: false,
      socket: nodeSocket({ ...acknowledging, tls: { ca: pki.ca } }),
    });

    await expect(client.send(adtA01().tree)).rejects.toMatchObject({
      cause: { code: "ERR_TLS_CERT_ALTNAME_INVALID" },
      code: "CONNECTION_FAILED",
    });
  });

  it("presents the client certificate to a remote system that requires one", async () => {
    const client = new MllpClient({
      socket: nodeSocket({
        ...pki.requiringClientCertificate,
        tls: {
          ca: pki.ca,
          cert: pki.cert,
          key: pki.key,
          servername: pki.servername,
        },
      }),
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
      socket: overTls(pki.requiringClientCertificate),
    });
    await client.connect();

    await expect(client.send(adtA01().tree)).rejects.toMatchObject({
      code: expect.stringMatching(/^(CONNECTION_LOST|SEND_TIMEOUT)$/),
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
