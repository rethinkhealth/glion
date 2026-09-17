/**
 * Regression for https://github.com/rethinkhealth/glion/issues/779.
 *
 * Date: 2026-09-13
 * Symptom: a second `close()` or a `destroy()` arriving while the first
 * `close()` was inside the socket's teardown resolved at once, with the
 * socket still open. `await using client` plus a signal handler doing
 * `await client.close(); process.exit()` exited with the socket up.
 * Cause: `destroy()` moved to `closed` before awaiting the session's
 * teardown, and the `closed` phase kept no handle to it, so a later call
 * returned from `case "closed"` immediately.
 * Resolution: the client moves to `closing` before the teardown starts and
 * holds its promise there; a `close()` or `destroy()` arriving during it
 * awaits that promise, and `closed` is reached only once the connection is
 * down.
 */

import { setTimeout } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { MllpClient } from "../../src/index";
import type { MllpSocket } from "../../src/index";
import { remoteSystem } from "../remote";

/** A client on a socket whose teardown takes a while, and whether it is down. */
async function slowToClose() {
  const remote = remoteSystem();
  let down = false;
  const socket: MllpSocket = {
    close: async () => {
      await setTimeout(50);
      await remote.socket.close();
      down = true;
    },
    connect: remote.socket.connect,
  };
  const client = new MllpClient({ socket });
  await client.connect();
  return { client, isDown: () => down };
}

describe("a close arriving during the teardown", () => {
  it("resolves a second close() only once the connection is down", async () => {
    // Given a client whose first close() is inside the socket's teardown
    const { client, isDown } = await slowToClose();
    const first = client.close();
    await setTimeout(5);

    // When close() is called again, as a signal handler racing `await using`
    // would
    await client.close();

    // Then the connection is down by the time it resolves
    expect(isDown()).toBe(true);
    await first;
  });

  it("resolves a destroy() only once the connection is down", async () => {
    // Given a client whose close() is inside the socket's teardown
    const { client, isDown } = await slowToClose();
    const first = client.close();
    await setTimeout(5);

    // When destroy() is called
    await client.destroy();

    // Then the connection is down by the time it resolves
    expect(isDown()).toBe(true);
    await first;
  });
});
