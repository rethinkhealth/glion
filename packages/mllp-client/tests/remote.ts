/**
 * The client tests' wire: an in-memory socket, and a remote system that
 * behaves like an MLLP server at its far end.
 *
 * `memorySocket()` is the socket alone, with the far end's stream handles in
 * the test's hands. `remoteSystem()` is the socket plus a peer that reads
 * frames and answers them, records what it received, and can fail the
 * connection on demand.
 *
 * @module
 */

import { frame, unframe } from "@glion/mllp-codec";
import { decodeBytes, encodeBytes } from "@glion/util-charset";
import { vi } from "vitest";

import { MllpClient } from "../src/index";
import type { MllpClientOptions, MllpSocket, MllpStreams } from "../src/index";
import { ack, controlIdOf } from "./fixtures";

/** How a socket answers `connect()`. */
export type Opening = (
  streams: MllpStreams,
  signal: AbortSignal
) => Promise<MllpStreams>;

/** Hands the streams over at once. */
const accepts: Opening = (streams) => Promise.resolve(streams);

// ── The socket ───────────────────────────────────────────────────────

/** One connection's streams, with the remote end's handles on them. */
function link() {
  const toClient = new TransformStream<Uint8Array, Uint8Array>();
  const fromClient = new TransformStream<Uint8Array, Uint8Array>();
  return {
    inbound: fromClient.readable.getReader(),
    outbound: toClient.writable.getWriter(),
    streams: {
      readable: toClient.readable,
      writable: fromClient.writable,
    } satisfies MllpStreams,
  };
}

/**
 * An `MllpSocket` over in-memory streams, with the far end of the current
 * connection in the test's hands. Each `connect()` after the first gets a
 * fresh pair. `close()` ends both directions.
 */
export function memorySocket(opening: Opening = accepts) {
  let current = link();
  let opened = 0;

  const close = vi.fn(async () => {
    try {
      await current.outbound.close();
    } catch {
      // The session released its reader first, which already ended this
      // side; the socket's close is contracted never to reject.
    }
    try {
      await current.streams.writable.close();
    } catch {
      // Already ended, or errored by `refusesWrites`.
    }
  });
  const connect = vi.fn((signal: AbortSignal) => {
    if (opened > 0) {
      current = link();
    }
    opened += 1;
    return opening(current.streams, signal);
  });

  /** The next message the client wrote, as text. */
  async function received(): Promise<string> {
    const next = await current.inbound.read();
    if (next.done) {
      throw new Error("the client closed its writable side");
    }
    return decodeBytes(next.value);
  }

  /** The remote end answers with one framed message. */
  function replies(text: string): Promise<void> {
    return current.outbound.write(frame(encodeBytes(text)));
  }

  return {
    remote: {
      /** Reads the next message and answers it with an MSA-1 of `code`. */
      async acknowledges(code: string, msa3 = ""): Promise<void> {
        await replies(
          ack(code, { controlId: controlIdOf(await received()), msa3 }).text
        );
      },
      /** The socket's own close, so a test can count it. */
      close,
      /** The remote end hangs up. */
      hangsUp: () => current.outbound.close(),
      /** How many times the socket has been asked to open. */
      get opened(): number {
        return opened;
      },
      received,
      /** The remote end stops reading, so the client's next write fails. */
      refusesWrites: () => current.inbound.cancel(new Error("EPIPE")),
      replies,
      /** The connection resets, so the client's next read fails. */
      resets: () => current.outbound.abort(new Error("ECONNRESET")),
      /** The remote end sends bytes, framed or not. */
      sends: (bytes: Uint8Array) => current.outbound.write(bytes),
      /** The signal the socket was given to open with. */
      get signal(): AbortSignal | undefined {
        return connect.mock.calls[0]?.[0];
      },
      /** The next bytes the client wrote. */
      async wrote(): Promise<Uint8Array | undefined> {
        const next = await current.inbound.read();
        return next.value;
      },
    },
    socket: { close, connect } satisfies MllpSocket,
  };
}

// ── The remote system ────────────────────────────────────────────────

/**
 * How the remote system answers one message: the text of a reply, framed on
 * the way out; raw bytes, sent as they are; or `undefined` for no reply.
 */
export type Answer = (
  message: string
) => string | Uint8Array | undefined | Promise<string | Uint8Array | undefined>;

/** Acknowledges every message with an MSA-1 of `code`, `msa3` in MSA-3. */
export function acknowledging(code: string, msa3 = ""): Answer {
  return (message) => ack(code, { controlId: controlIdOf(message), msa3 }).text;
}

/** Never answers. */
export const silence: Answer = () => {};

/** One accepted connection, as the remote system holds it. */
interface Connection {
  readonly messages: ReadableStreamDefaultReader<Uint8Array>;
  readonly outbound: WritableStreamDefaultWriter<Uint8Array>;
  readonly streams: MllpStreams;
}

/**
 * An MLLP peer over an in-memory socket. It accepts every connection the
 * socket opens, reads the frames the client writes, and answers each one
 * through `answers()`: acknowledging with `AA` until told otherwise.
 *
 * What it received is on `received`; what the client did to the socket is on
 * `opened` and `closed`. The fault methods act on the current connection.
 */
export function remoteSystem(opening: Opening = accepts) {
  const received: string[] = [];
  let waiting: ((message: string) => void)[] = [];
  let answer: Answer = acknowledging("AA");
  let current: Connection | null = null;
  let opened = 0;
  let closed = 0;

  const connection = (): Connection => {
    if (current === null) {
      throw new Error("the client has not opened a connection yet");
    }
    return current;
  };

  /** Reads and answers messages until the connection ends. */
  const serve = async ({ messages, outbound }: Connection): Promise<void> => {
    try {
      for (
        let next = await messages.read();
        !next.done;
        next = await messages.read()
      ) {
        const message = decodeBytes(next.value);
        received.push(message);
        const woken = waiting;
        waiting = [];
        for (const wake of woken) {
          wake(message);
        }
        const reply = await answer(message);
        if (reply !== undefined) {
          await outbound.write(
            typeof reply === "string" ? frame(encodeBytes(reply)) : reply
          );
        }
      }
    } catch {
      // The connection broke under the peer: a fault a test asked for, or the
      // client tearing the socket down while a reply was on its way.
    }
  };

  const socket: MllpSocket = {
    close: vi.fn(async () => {
      closed += 1;
      const { outbound, streams } = connection();
      try {
        await outbound.close();
      } catch {
        // Already hung up, reset, or released; close never rejects.
      }
      try {
        await streams.writable.close();
      } catch {
        // Already ended, or errored by `stopsReading`.
      }
    }),
    connect: vi.fn(async (signal: AbortSignal) => {
      opened += 1;
      const toClient = new TransformStream<Uint8Array, Uint8Array>();
      const fromClient = new TransformStream<Uint8Array, Uint8Array>();
      const next: Connection = {
        messages: fromClient.readable.pipeThrough(unframe()).getReader(),
        outbound: toClient.writable.getWriter(),
        streams: { readable: toClient.readable, writable: fromClient.writable },
      };
      current = next;
      const streams = await opening(next.streams, signal);
      void serve(next);
      return streams;
    }),
  };

  return {
    /** How each message is answered from now on. */
    answers(next: Answer): void {
      answer = next;
    },
    /** How many times the client closed the socket. */
    get closed(): number {
      return closed;
    },
    /** Hangs up: ends what it sends, so the client's next read sees the end. */
    hangsUp: () => connection().outbound.close(),
    /** How many times the client opened the socket. */
    get opened(): number {
      return opened;
    },
    /** Every message received so far, as text, in order. */
    received: received as readonly string[],
    /** Resolves with the next message the client sends. */
    receives(): Promise<string> {
      // oxlint-disable-next-line promise/avoid-new -- wrapping a callback
      return new Promise<string>((resolve) => {
        waiting.push(resolve);
      });
    },
    /** Answers with one framed message, outside of `answers()`. */
    replies: (text: string) =>
      connection().outbound.write(frame(encodeBytes(text))),
    /** Resets the connection, so the client's next read fails. */
    resets: () => connection().outbound.abort(new Error("ECONNRESET")),
    /** Sends bytes as they are, framed or not. */
    sends: (bytes: Uint8Array) => connection().outbound.write(bytes),
    /** The signal the socket was last opened with. */
    get signal(): AbortSignal | undefined {
      return vi.mocked(socket.connect).mock.lastCall?.[0];
    },
    socket,
    /** Stops reading, so the client's next write fails. */
    stopsReading: () => connection().messages.cancel(new Error("EPIPE")),
  };
}

export type RemoteSystem = ReturnType<typeof remoteSystem>;

/** A client connected to a remote system that acknowledges everything. */
export async function connectedClient(
  opts: Omit<Partial<MllpClientOptions>, "socket"> = {}
) {
  const remote = remoteSystem();
  const client = new MllpClient({ socket: remote.socket, ...opts });
  await client.connect();
  return { client, remote };
}
