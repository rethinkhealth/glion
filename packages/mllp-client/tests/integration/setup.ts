/**
 * Starts the remote systems the integration suites dial, once, in Node, and
 * provides their addresses to every test project, whichever runtime runs it.
 *
 * @module
 */

import type { TestProject } from "vitest/node";

import { acknowledging, silence } from "../remote";
import { acknowledgment, listen, rejectingFirst, released } from "./remote-tcp";
import type { Address, Answer, Remote } from "./remote-tcp";

const SPLIT_DELAY_MS = 40;

export interface Remotes {
  /** Answers every message with `AA`. */
  readonly acknowledging: Address;
  /** Answers `AA` and sends FIN in the same write. */
  readonly acknowledgingThenEnding: Address;
  /** Reads one message, then resets the connection. */
  readonly dropping: Address;
  /** Answers every message with the message itself. */
  readonly echoing: Address;
  /** Reads one message, then sends FIN without answering. */
  readonly ending: Address;
  /** Accepts, never writes, and never answers a FIN. */
  readonly holdingOpen: Address;
  /** Nothing listens here. */
  readonly refused: Address;
  /** Answers the first message on a connection with `AE`, the rest with `AA`. */
  readonly rejectingFirst: Address;
  /** Accepts and never writes. */
  readonly silent: Address;
  /** Answers `AA` in two writes 40 ms apart. */
  readonly splitting: Address;
}

declare module "vitest" {
  export interface ProvidedContext {
    readonly remotes: Remotes;
  }
}

export default async function setup(project: TestProject) {
  const started: Remote[] = [];
  const start = async (
    answer: Answer,
    allowHalfOpen = false
  ): Promise<Address> => {
    const remote = await listen({ allowHalfOpen, answer });
    started.push(remote);
    return { host: remote.host, port: remote.port };
  };

  project.provide("remotes", {
    acknowledging: await start(acknowledging("AA")),
    acknowledgingThenEnding: await start((message, socket) => {
      socket.end(acknowledgment(message));
    }),
    dropping: await start((_message, socket) => {
      socket.destroy();
    }),
    echoing: await start((message) => message),
    ending: await start((_message, socket) => {
      socket.end();
    }),
    holdingOpen: await start(silence, true),
    refused: await released(),
    rejectingFirst: await start(rejectingFirst()),
    silent: await start(silence),
    splitting: await start((message, socket) => {
      const bytes = acknowledgment(message);
      const mid = Math.floor(bytes.length / 2);
      socket.write(bytes.subarray(0, mid));
      setTimeout(() => socket.write(bytes.subarray(mid)), SPLIT_DELAY_MS);
    }),
  });

  return async () => {
    await Promise.all(started.map((remote) => remote.close()));
  };
}
