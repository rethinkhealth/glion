/**
 * An in-memory socket for the client tests: two `TransformStream`s per
 * connection, with the remote end in the test's hands. Each `connect()` after
 * the first gets a fresh pair.
 *
 * @module
 */

import { frame } from "@glion/mllp-codec";
import { decodeBytes, encodeBytes } from "@glion/util-charset";
import { vi } from "vitest";

import { MllpClient } from "../../src/index";
import type {
  MllpClientEvent,
  MllpClientOptions,
  MllpSocket,
  MllpStreams,
} from "../../src/index";
import { ack, controlIdOf } from "../fixtures";

/** How a stub socket answers `connect()`. */
export type Opening = (
  streams: MllpStreams,
  signal: AbortSignal
) => Promise<MllpStreams>;

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
 * A socket wired to in-memory streams, with its far end in the test's hands.
 * `remote` always speaks for the latest connection.
 */
export function stubSocket(
  opening: Opening = (streams) => Promise.resolve(streams)
) {
  let current = link();
  let opened = 0;

  const close = vi.fn(async () => {
    try {
      await current.outbound.close();
    } catch {
      // The connection released its reader first, which already ended this
      // side; the socket's close is contracted never to reject.
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

  /** The remote system answers with one framed message. */
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
      /** The remote system hangs up. */
      hangsUp: () => current.outbound.close(),
      /** How many times the socket has been asked to open. */
      get opened(): number {
        return opened;
      },
      received,
      /** The remote system stops reading, so the client's next write fails. */
      refusesWrites: () => current.inbound.cancel(new Error("EPIPE")),
      replies,
      /** The remote system sends bytes, framed or not. */
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
    get streams(): MllpStreams {
      return current.streams;
    },
  };
}

/** A connected client over a socket the test controls. */
export async function connectedClient(
  opts: Omit<Partial<MllpClientOptions>, "socket"> = {}
) {
  const { socket, remote } = stubSocket();
  const client = new MllpClient({ socket, ...opts });
  await client.connect();
  return { client, remote };
}

/** Resolves the next time `client` reports `event`. */
export function emitted(
  client: MllpClient,
  event: MllpClientEvent
): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping a listener
  return new Promise<void>((resolve) => {
    const once = () => {
      client.off(event, once);
      resolve();
    };
    client.on(event, once);
  });
}
