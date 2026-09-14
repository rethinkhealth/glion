/**
 * The conformance suites over the Node runtime adapter, on real loopback
 * sockets.
 */

import { DEFAULT_GRACEFUL_CLOSE_MS, nodeSocket } from "../../src/runtime/node";
import { startPeer } from "../loopback";
import { describeMllpClientScenarios } from "./client-scenarios";
import { describeMllpSocketContract } from "./socket-contract";

/** Slack on top of the grace window for the destroy to be observed. */
const CLOSE_SLACK_MS = 500;

describeMllpSocketContract("nodeSocket", {
  closeBoundMs: DEFAULT_GRACEFUL_CLOSE_MS + CLOSE_SLACK_MS,
  open: nodeSocket,
  receiver: startPeer,
});

describeMllpClientScenarios("nodeSocket", {
  open: nodeSocket,
  receiver: startPeer,
});
