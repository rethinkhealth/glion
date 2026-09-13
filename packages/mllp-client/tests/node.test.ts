/**
 * The Node runtime adapter: the conformance suites over real loopback
 * sockets, plus what only Node's `net.Socket` guarantees.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_GRACEFUL_CLOSE_MS, nodeSocket } from "../src/runtime/node";
import {
  describeMllpClientScenarios,
  inProcess as scenariosInProcess,
} from "./conformance/client-scenarios";
import { startReceiver } from "./conformance/receiver";
import {
  describeMllpSocketContract,
  inProcess as contractInProcess,
} from "./conformance/socket-contract";

/** Slack on top of the grace window for the destroy to be observed. */
const CLOSE_SLACK_MS = 500;

describeMllpSocketContract(
  "nodeSocket",
  contractInProcess(nodeSocket, {
    closeBoundMs: DEFAULT_GRACEFUL_CLOSE_MS + CLOSE_SLACK_MS,
    finOnClose: true,
  })
);

describeMllpClientScenarios("nodeSocket", scenariosInProcess(nodeSocket));

describe("nodeSocket — grace window", () => {
  it("waits gracefulCloseMs for the remote system's FIN before destroying", async () => {
    await using receiver = await startReceiver("holdsOpen");
    const socket = nodeSocket({ ...receiver.address, gracefulCloseMs: 200 });
    await socket.connect(new AbortController().signal);

    const started = performance.now();
    await socket.close();
    const elapsed = performance.now() - started;

    expect(elapsed).toBeGreaterThanOrEqual(180);
    expect(elapsed).toBeLessThan(200 + CLOSE_SLACK_MS);
  });
});
