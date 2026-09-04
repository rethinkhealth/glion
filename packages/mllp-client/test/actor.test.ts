/**
 * The actor against a stub connection.
 *
 * These are the interleavings that used to need fake timers and hope. Here each
 * one is written by deciding when a fact reaches the mailbox: the connection
 * hands out its own read/write promises, so a test settles them in whatever
 * order it wants to prove.
 */

import { setTimeout as setTimeoutPromise } from "node:timers/promises";

import { encodeBytes } from "@glion/util-charset";
import { describe, expect, it } from "vitest";

import { createActor } from "../src/actor";
import { encode } from "../src/codec";
import type { FramedConnection } from "../src/connection";
import { MllpErrorCode } from "../src/errors";
import { ack, adtA01, controlIdOf } from "./fixtures";

/** What a read hands back: one message, already unframed by the connection. */
const payload = (text: string): Uint8Array => encodeBytes(text);

/** A promise this test settles by hand, to place a fact in the mailbox. */
function gate<T = undefined>() {
  let settle!: (value: T) => void;
  let fail!: (reason: unknown) => void;
  // oxlint-disable-next-line promise/avoid-new -- the point of the helper
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { fail, promise, settle };
}

/** A connection whose every operation the test settles by hand. */
function stubConnection() {
  const reads: ReturnType<typeof gate<Uint8Array | null>>[] = [];
  const writes: ReturnType<typeof gate<undefined>>[] = [];
  let closeCalls = 0;

  const connection: FramedConnection = {
    close() {
      closeCalls += 1;
      return Promise.resolve();
    },
    read() {
      const next = gate<Uint8Array | null>();
      reads.push(next);
      return next.promise;
    },
    write() {
      const next = gate();
      writes.push(next);
      return next.promise.then(() => {});
    },
  };

  return {
    get closeCalls() {
      return closeCalls;
    },
    connection,
    reads,
    writes,
  };
}

/** Lets every already-settled effect reach the mailbox. */
function drain(): Promise<void> {
  return setTimeoutPromise(0);
}

function actorOn(
  connection: FramedConnection,
  opened = gate<FramedConnection>()
) {
  const actor = createActor({
    connectTimeoutMs: 10_000,
    openFramedConnection: () => opened.promise,
  });
  return { actor, open: () => opened.settle(connection) };
}

describe("the actor", () => {
  it("drops the acknowledgment of a send that has already timed out", async () => {
    const remote = stubConnection();
    const { actor, open } = actorOn(remote.connection);
    const message = adtA01();

    const sending = actor.send(encode(message), 10);
    open();
    await drain();
    remote.writes[0]?.settle(undefined);
    await drain();

    // The deadline fires first; the acknowledgment lands a turn later.
    await expect(sending).rejects.toMatchObject({
      code: MllpErrorCode.SEND_TIMEOUT,
    });
    remote.reads[0]?.settle(payload(ack("AA", controlIdOf(message))));
    await drain();

    // The straggler changed nothing: the client stayed closed, and the
    // connection was torn down exactly once.
    expect(actor.state).toBe("closed");
    expect(remote.closeCalls).toBe(1);
  });

  it("keeps the connection when a NAK answers, and closes when a stray frame does", async () => {
    const remote = stubConnection();
    const { actor, open } = actorOn(remote.connection);
    const first = adtA01();

    const nak = actor.send(encode(first), 10_000);
    open();
    await drain();
    remote.writes[0]?.settle(undefined);
    remote.reads[0]?.settle(payload(ack("AE", controlIdOf(first))));
    await expect(nak).rejects.toMatchObject({ code: "AE" });
    expect(actor.state).toBe("connected");

    // The next send is answered for someone else: the connection is out of step.
    const second = actor.send(encode(adtA01()), 10_000);
    await drain();
    remote.writes[1]?.settle(undefined);
    remote.reads[1]?.settle(payload(ack("AA", "SOMEONE-ELSE")));

    await expect(second).rejects.toMatchObject({
      code: MllpErrorCode.INVALID_RESPONSE,
    });
    expect(actor.state).toBe("closed");
  });

  it("disposes of a connection that opens after close() gave up on it", async () => {
    const remote = stubConnection();
    const opened = gate<FramedConnection>();
    const { actor } = actorOn(remote.connection, opened);

    const connecting = actor.connect();
    const closing = actor.close();
    await expect(connecting).rejects.toMatchObject({
      code: MllpErrorCode.CONNECT_ABORTED,
    });

    // close() has not resolved yet: the connector is still holding a connection it
    // is about to hand over, and that connection has to be closed first.
    opened.settle(remote.connection);
    await closing;
    expect(remote.closeCalls).toBe(1);
  });

  it("ignores a write that fails after the client is already closed", async () => {
    const remote = stubConnection();
    const { actor, open } = actorOn(remote.connection);

    const sending = actor.send(encode(adtA01()), 10_000);
    open();
    await drain();
    const closing = actor.close();
    await expect(sending).rejects.toMatchObject({
      code: MllpErrorCode.CLOSED,
      delivery: "unknown",
    });

    remote.writes[0]?.fail(new Error("EPIPE"));
    remote.reads[0]?.fail(new Error("stream released"));
    await closing;
    await drain();

    expect(actor.state).toBe("closed");
    expect(remote.closeCalls).toBe(1);
  });

  it("refuses a second send while one is on the connection, in every phase", async () => {
    const remote = stubConnection();
    const opened = gate<FramedConnection>();
    const { actor } = actorOn(remote.connection, opened);

    // Still connecting: the first send owns the attempt.
    const queued = actor.send(encode(adtA01()), 10_000);
    await expect(actor.send(encode(adtA01()), 10_000)).rejects.toMatchObject({
      code: MllpErrorCode.ALREADY_SENDING,
    });

    // Connected: the first send owns the connection.
    opened.settle(remote.connection);
    await drain();
    expect(actor.state).toBe("sending");
    await expect(actor.send(encode(adtA01()), 10_000)).rejects.toMatchObject({
      code: MllpErrorCode.ALREADY_SENDING,
    });

    await actor.close();
    await expect(queued).rejects.toMatchObject({ code: MllpErrorCode.CLOSED });
  });
});
