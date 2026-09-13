/**
 * Regression found in review of
 * https://github.com/rethinkhealth/glion/issues/754; no issue of its own.
 *
 * Date: 2026-09-13
 * Symptom: a second `close()` arriving while the first was waiting out the
 * message on the wire ended the connection at once, and that message
 * rejected with `SEND_ABORTED`, delivery unknown. `await using` plus a
 * signal handler calling `close()` was enough to trigger it.
 * Cause: `close()` only waited from the `sending` phase. From `closing` it
 * fell through to `destroy()`, whose `closing` arm destroys the session.
 * Resolution: `close()` waits out the message in flight from `closing` too.
 */

import { setTimeout } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { ack, adtA01, controlIdOf } from "../fixtures";
import { connectedClient } from "../remote";

describe("close() called twice", () => {
  it("does not cut off the message in flight", async () => {
    // Given a message on the wire, unanswered for a while
    const { client, remote } = await connectedClient();
    const first = adtA01();
    remote.answers(async (message) => {
      await setTimeout(30);
      return ack("AA", { controlId: controlIdOf(message) }).text;
    });
    const inFlight = client.send(first.tree);
    await remote.receives();

    // When the client is closed twice over, as `await using` plus a signal
    // handler would
    const closes = Promise.all([client.close(), client.close()]);

    // Then the message is acknowledged, not aborted, and both closes resolve
    await expect(inFlight).resolves.toMatchObject({
      controlId: first.controlId,
    });
    await closes;
    expect(client.state).toBe("closed");
  });
});
