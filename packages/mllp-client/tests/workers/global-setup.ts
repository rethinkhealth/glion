/**
 * Starts one loopback receiver per behaviour the Workers adapter tests need,
 * in Node, and hands each port to the tests running inside `workerd`.
 *
 * @module
 */

import type { Socket } from "node:net";

import type { TestProject } from "vitest/node";

import { acknowledgment, releasedPort, startReceiver } from "./receiver";
import type { Receiver } from "./receiver";

declare module "vitest" {
  export interface ProvidedContext {
    /** Answers every message with `AA`. */
    readonly acknowledgesPort: number;
    /** Answers `AA` and sends FIN in the same write. */
    readonly acknowledgesThenEndsPort: number;
    /** Reads one message, then resets the connection. */
    readonly dropsAfterReadPort: number;
    /** Accepts, never writes, and never answers a FIN. */
    readonly holdsOpenPort: number;
    /** Nothing listens here. */
    readonly refusedPort: number;
    /** Answers the first message with `AE`, every later one with `AA`. */
    readonly rejectsFirstPort: number;
    /** Accepts and never writes. */
    readonly silentPort: number;
    /** Answers `AA` in two writes 40 ms apart. */
    readonly splitsAcknowledgmentPort: number;
  }
}

const SPLIT_DELAY_MS = 40;

const acknowledges = (socket: Socket) => {
  socket.on("data", (chunk: Buffer) => {
    socket.write(acknowledgment(chunk, "AA"));
  });
};

const acknowledgesThenEnds = (socket: Socket) => {
  socket.on("data", (chunk: Buffer) => {
    if (!socket.writableEnded) {
      socket.end(acknowledgment(chunk, "AA"));
    }
  });
};

const dropsAfterRead = (socket: Socket) => {
  socket.on("data", () => socket.destroy());
};

const rejectsFirst = (socket: Socket) => {
  let first = true;
  socket.on("data", (chunk: Buffer) => {
    socket.write(
      first
        ? acknowledgment(chunk, "AE", "Application error")
        : acknowledgment(chunk, "AA")
    );
    first = false;
  });
};

const splitsAcknowledgment = (socket: Socket) => {
  socket.on("data", (chunk: Buffer) => {
    const bytes = acknowledgment(chunk, "AA");
    const mid = Math.floor(bytes.length / 2);
    socket.write(bytes.subarray(0, mid));
    setTimeout(() => socket.write(bytes.subarray(mid)), SPLIT_DELAY_MS);
  });
};

export default async function setup(project: TestProject) {
  const receivers: Receiver[] = [];
  const start = async (
    onConnection?: (socket: Socket) => void,
    allowHalfOpen = false
  ) => {
    const receiver = await startReceiver({ allowHalfOpen, onConnection });
    receivers.push(receiver);
    return receiver.port;
  };

  const refused = await releasedPort();
  project.provide("acknowledgesPort", await start(acknowledges));
  project.provide("refusedPort", refused.port);
  project.provide(
    "acknowledgesThenEndsPort",
    await start(acknowledgesThenEnds)
  );
  project.provide("dropsAfterReadPort", await start(dropsAfterRead));
  project.provide("holdsOpenPort", await start(undefined, true));
  project.provide("rejectsFirstPort", await start(rejectsFirst));
  project.provide("silentPort", await start());
  project.provide(
    "splitsAcknowledgmentPort",
    await start(splitsAcknowledgment)
  );

  return async () => {
    await Promise.all(receivers.map((receiver) => receiver.close()));
  };
}
