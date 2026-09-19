/**
 * Every remote system the integration suites dial, with what it does. One
 * entry per name: `setup.ts` starts them, a test reaches them by name through
 * `inject("fixtures")`.
 *
 * @module
 */

import type { Socket } from "node:net";

import { acknowledging, silence } from "../answers";
import { acknowledgment } from "./remote-tcp";
import type { Address, Answer } from "./remote-tcp";

/** Milliseconds between the two halves `splitting` writes. */
const SPLIT_DELAY_MS = 40;

/** One remote system, as `setup.ts` starts it. */
export interface RemoteSpec {
  /** How it answers each message it reads. */
  readonly answer: Answer;
  /** Keep its side open after the client's FIN. Default `false`. */
  readonly allowHalfOpen?: boolean;
}

/** Answers the first message on each connection with `AE`, the rest with `AA`. */
function rejectingFirst(): Answer {
  const rejected = new WeakSet<Socket>();
  return (message, socket) => {
    if (rejected.has(socket)) {
      return acknowledging("AA")(message);
    }
    rejected.add(socket);
    return acknowledging("AE", "Application error")(message);
  };
}

/**
 * Every remote the suites dial. A `null` entry starts nothing: the port
 * refuses.
 */
export const REMOTES = {
  /** Answers every message with `AA`. */
  acknowledging: { answer: acknowledging("AA") },

  /** Answers `AA` and sends FIN in the same write. */
  acknowledgingThenEnding: {
    answer: (message, socket) => {
      socket.end(acknowledgment(message));
    },
  },

  /** Reads one message, then resets the connection. */
  dropping: {
    answer: (_message, socket) => {
      socket.destroy();
    },
  },

  /** Answers every message with the message itself. */
  echoing: { answer: (message) => message },

  /** Reads one message, then sends FIN without answering. */
  ending: {
    answer: (_message, socket) => {
      socket.end();
    },
  },

  /** Accepts, never writes, and never answers a FIN. */
  holdingOpen: { allowHalfOpen: true, answer: silence },

  /** Nothing listens here. */
  refused: null,

  /** Answers the first message on a connection with `AE`, the rest with `AA`. */
  rejectingFirst: { answer: rejectingFirst() },

  /** Accepts and never writes. */
  silent: { answer: silence },

  /** Answers `AA` in two writes 40 ms apart. */
  splitting: {
    answer: (message, socket) => {
      const bytes = acknowledgment(message);
      const half = Math.floor(bytes.length / 2);
      socket.write(bytes.subarray(0, half));
      setTimeout(() => socket.write(bytes.subarray(half)), SPLIT_DELAY_MS);
    },
  },
} as const satisfies Record<string, RemoteSpec | null>;

/** Where each remote in {@link REMOTES} is listening. */
export type Remotes = Readonly<Record<keyof typeof REMOTES, Address>>;
