/**
 * The Cloudflare Workers runtime adapter, inside `workerd`: this file runs
 * in the Workers runtime through `@cloudflare/vitest-plugin`, so
 * `workersSocket` dials through the runtime's own `cloudflare:sockets`. The
 * remote systems are the ones `setup.ts` starts in Node.
 */

import { describe, expect, inject, it } from "vitest";

import { MllpClient } from "../../src/index";
import type { WorkersSocketOptions } from "../../src/runtime/workers";
import { workersSocket } from "../../src/runtime/workers";
import { adtA01 } from "../fixtures";
import { describeMllpClientScenarios } from "./conformance/client-scenarios";
import { describeMllpSocketContract } from "./conformance/socket-contract";

/** Workerd resolves `close()` at once; nothing waits for the remote system. */
const CLOSE_BOUND_MS = 500;

describeMllpSocketContract("workersSocket", workersSocket, {
  closeBoundMs: CLOSE_BOUND_MS,
  remotes: inject("remotes"),
});

describeMllpClientScenarios("workersSocket", workersSocket, inject("remotes"));

describe("workersSocket over TLS", () => {
  it("throws INVALID_OPTION for TLS settings Workers cannot apply", () => {
    const options = {
      ...inject("remotesOverTls").acknowledging,
      tls: { ca: inject("pki").ca },
    } as unknown as WorkersSocketOptions;

    expect(() => workersSocket(options)).toThrow(
      expect.objectContaining({ code: "INVALID_OPTION" })
    );
  });

  it("does not dial plain TCP when tls is true", async () => {
    const client = new MllpClient({
      reconnect: false,
      socket: workersSocket({ ...inject("remotes").acknowledging, tls: true }),
    });

    await expect(client.send(adtA01().tree)).rejects.toMatchObject({
      code: "CONNECTION_FAILED",
    });
  });
});
