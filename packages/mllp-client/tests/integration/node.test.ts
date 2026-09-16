/**
 * The Node runtime adapter over real sockets: the `MllpSocket` contract
 * suite, what only `net.Socket` lets a test observe at the far end, and the
 * client over it.
 */

import type { Socket } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { MllpClient, MllpErrorCode } from "../../src/index";
import { DEFAULT_GRACEFUL_CLOSE_MS, nodeSocket } from "../../src/runtime/node";
import { adtA01 } from "../fixtures";
import { acknowledging, silence } from "../remote";
import { describeMllpSocketContract } from "./conformance/socket-contract";
import { listen } from "./remote-tcp";

/** Slack on top of the grace window for the destroy to be observed. */
const CLOSE_SLACK_MS = 500;

/** Time for the remote system to observe the client's close. */
const SETTLE_MS = 50;

describeMllpSocketContract("nodeSocket", nodeSocket, {
  closeBoundMs: DEFAULT_GRACEFUL_CLOSE_MS + CLOSE_SLACK_MS,
});

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

describe("MllpClient over nodeSocket", () => {
  it("round-trips a message", async () => {
    await using remote = await listen();
    const client = new MllpClient({ socket: nodeSocket(remote) });
    const { controlId, tree } = adtA01();

    const response = await client.send(tree);

    expect(response.code).toBe("AA");
    expect(response.raw).toContain(`MSA|AA|${controlId}`);
    await client.close();
  });

  it("closes with CONNECTION_LOST when the remote system drops; a new client dials a fresh socket", async () => {
    const acknowledged = new WeakSet<Socket>();
    await using remote = await listen({
      // Acknowledges the first message on each connection and drops the next.
      answer: (message, socket) => {
        if (acknowledged.has(socket)) {
          socket.destroy();
          return;
        }
        acknowledged.add(socket);
        return acknowledging("AA")(message);
      },
    });
    const socket = nodeSocket(remote);
    const client = new MllpClient({ socket });
    await client.send(adtA01().tree);

    await expect(client.send(adtA01().tree)).rejects.toMatchObject({
      code: MllpErrorCode.CONNECTION_LOST,
    });
    expect(client.state).toBe("closed");

    const next = new MllpClient({ socket });
    await expect(next.send(adtA01().tree)).resolves.toMatchObject({
      code: "AA",
    });
    await next.close();
  });
});
