/**
 * Regression for https://github.com/rethinkhealth/glion/issues/754.
 *
 * Date: 2026-09-13
 * Symptom: a `send()` waiting behind the message on the wire is overtaken by
 * a `send()` called later from that message's acknowledgment. The wire sees
 * 1, 3, 2, and a feed that awaits each send in turn starves every other
 * producer on the client.
 * Cause: every waiter awaits the one `done` promise of the `sending` phase
 * and re-reads the phase on waking. The in-flight send's caller resumes in
 * the same turn, and its next `send()` finds the client `connected` first.
 * Resolution: the client holds a queue of turns in call order; the head runs
 * its own send and, on finishing, wakes the next. A completion wakes one
 * waiter, and a send arriving meanwhile joins the back.
 */

import { describe, expect, it } from "vitest";

import { adtA01, controlIdOf } from "../fixtures";
import { connectedClient } from "../remote";

describe("a send waiting its turn keeps its place", () => {
  it("goes out before a send called later, even one called from the acknowledgment it waited for", async () => {
    // Given a message on the wire and a second one waiting behind it
    const { client, remote } = await connectedClient();
    const [first, second, third] = [adtA01(), adtA01(), adtA01()];
    const a = client.send(first.tree);
    const b = client.send(second.tree);

    // When the first is acknowledged and its caller sends a third at once
    await a;
    const c = client.send(third.tree);

    // Then the second goes out before the third: it was called first
    await Promise.all([b, c]);
    expect(remote.received.map(controlIdOf)).toEqual([
      first.controlId,
      second.controlId,
      third.controlId,
    ]);
    await client.close();
  });
});
