/**
 * The Node runtime adapter: the conformance suites over real loopback
 * sockets, plus what only Node's `net.Socket` lets a test observe.
 */

import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { MllpClient } from "../src/index";
import { DEFAULT_GRACEFUL_CLOSE_MS, nodeSocket } from "../src/runtime/node";
import { describeMllpClientScenarios } from "./conformance/client-scenarios";
import { describeMllpSocketContract } from "./conformance/socket-contract";
import { adtA01 } from "./fixtures";
import { listen, peers, startPeer } from "./loopback";

/** Slack on top of the grace window for the destroy to be observed. */
const CLOSE_SLACK_MS = 500;

/** Time for the remote system to observe the client's close. */
const SETTLE_MS = 50;

describeMllpSocketContract("nodeSocket", {
  closeBoundMs: DEFAULT_GRACEFUL_CLOSE_MS + CLOSE_SLACK_MS,
  open: nodeSocket,
  receiver: startPeer,
});

describeMllpClientScenarios("nodeSocket", {
  open: nodeSocket,
  receiver: startPeer,
});

describe("nodeSocket over net.Socket", () => {
  it("does not dial when the signal is already aborted", async () => {
    await using remote = await listen(peers.acknowledges);
    const socket = nodeSocket(remote);

    await expect(
      socket.connect(AbortSignal.abort(new Error("the caller gave up")))
    ).rejects.toThrow();
    await sleep(SETTLE_MS);

    expect(remote.connections).toBe(0);
  });

  it("dials a fresh connection after close()", async () => {
    await using remote = await listen(peers.acknowledges);
    const socket = nodeSocket(remote);

    await socket.connect(new AbortController().signal);
    await socket.close();
    await socket.connect(new AbortController().signal);
    await socket.close();

    expect(remote.connections).toBe(2);
  });

  it("ends with FIN, not RST, when close() follows an exchange", async () => {
    await using remote = await listen(peers.acknowledges);
    const client = new MllpClient({ socket: nodeSocket(remote) });

    await client.send(adtA01().tree);
    await client.close();
    await sleep(SETTLE_MS);

    expect(remote.closes).toEqual(["end"]);
  });

  it("destroys the socket after gracefulCloseMs when the remote system never answers the FIN", async () => {
    await using remote = await listen(peers.holdsOpen);
    const socket = nodeSocket({ ...remote, gracefulCloseMs: 200 });
    await socket.connect(new AbortController().signal);

    const started = performance.now();
    await socket.close();
    const elapsed = performance.now() - started;

    expect(elapsed).toBeGreaterThanOrEqual(180);
    expect(elapsed).toBeLessThan(200 + CLOSE_SLACK_MS);
  });
});
