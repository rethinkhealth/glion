import type { Socket } from "cloudflare:sockets";
import { describe, expect, it } from "vitest";

import { workersSocket } from "../../src/runtime/workers";

/**
 * A Workers socket whose `opened` settles when the test says, and that counts
 * its `close()` calls. The adapter reads nothing else from it.
 */
function remoteSocket() {
  const opened = Promise.withResolvers<null>();
  let closes = 0;
  const socket: Socket = {
    close: () => {
      closes += 1;
      return Promise.resolve();
    },
    closed: Promise.resolve(),
    opened: opened.promise,
    readable: new ReadableStream(),
    startTls: () => socket,
    writable: new WritableStream(),
  };
  return {
    get closes() {
      return closes;
    },
    fail: opened.reject,
    open: () => opened.resolve(null),
    socket,
  };
}

describe("workersSocket", () => {
  it("does not dial until connect() is called", () => {
    let dials = 0;
    const dial = () => {
      dials += 1;
      throw new Error("dialed");
    };

    workersSocket(dial);

    expect(dials).toBe(0);
  });

  it("throws INVALID_OPTION when dial is not a function", () => {
    const legacy = { host: "hl7.example.org", port: 2575 };

    expect(() => workersSocket(legacy as never)).toThrow(
      expect.objectContaining({
        code: "INVALID_OPTION",
        message:
          "`dial` is not a function; it must open a connection to the remote system.",
      })
    );
  });

  it("resolves the socket's streams once it is open, and close() closes it", async () => {
    const remote = remoteSocket();
    const socket = workersSocket(() => remote.socket);

    remote.open();
    const streams = await socket.connect(new AbortController().signal);
    await socket.close();

    expect(streams).toEqual({
      readable: remote.socket.readable,
      writable: remote.socket.writable,
    });
    expect(remote.closes).toBe(1);
  });

  it("closes nothing when close() is called before connect()", async () => {
    const socket = workersSocket(() => remoteSocket().socket);

    await expect(socket.close()).resolves.toBeUndefined();
  });

  it("rejects with the dial's failure when the socket does not open", async () => {
    const remote = remoteSocket();
    const socket = workersSocket(() => remote.socket);
    const refused = new Error("connection refused");

    remote.fail(refused);

    await expect(socket.connect(new AbortController().signal)).rejects.toBe(
      refused
    );
  });

  it("does not dial when the signal is already aborted", async () => {
    let dials = 0;
    const socket = workersSocket(() => {
      dials += 1;
      return remoteSocket().socket;
    });
    const reason = new Error("the caller gave up");

    await expect(socket.connect(AbortSignal.abort(reason))).rejects.toBe(
      reason
    );
    expect(dials).toBe(0);
  });

  it("rejects with the signal's reason when cancelled before the socket opens, and closes the socket", async () => {
    const remote = remoteSocket();
    const socket = workersSocket(() => remote.socket);
    const attempt = new AbortController();
    const reason = new Error("the caller gave up");

    const connecting = socket.connect(attempt.signal);
    attempt.abort(reason);

    await expect(connecting).rejects.toBe(reason);
    expect(remote.closes).toBe(1);
  });

  it("rejects a dial that returns a promise, and closes its socket", async () => {
    const remote = remoteSocket();
    const socket = workersSocket((() =>
      Promise.resolve(remote.socket)) as never);

    await expect(socket.connect(new AbortController().signal)).rejects.toThrow(
      "`dial` returned a promise; it must return the socket."
    );
    expect(remote.closes).toBe(1);
  });
});
