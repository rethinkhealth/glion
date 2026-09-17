/**
 * The Cloudflare Workers runtime adapter, inside `workerd`: this file runs
 * in the Workers runtime through `@cloudflare/vitest-plugin`, so
 * `workersSocket` dials through the runtime's own `cloudflare:sockets`. The
 * remote systems are the ones `setup.ts` starts in Node.
 */

import { workersSocket } from "../../src/runtime/workers";
import { describeMllpClientScenarios } from "./conformance/client-scenarios";
import { describeMllpSocketContract } from "./conformance/socket-contract";

/** Workerd resolves `close()` at once; nothing waits for the remote system. */
const CLOSE_BOUND_MS = 500;

describeMllpSocketContract("workersSocket", workersSocket, {
  closeBoundMs: CLOSE_BOUND_MS,
});

describeMllpClientScenarios("workersSocket", workersSocket);
