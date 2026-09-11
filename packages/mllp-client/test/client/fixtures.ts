/**
 * An in-memory socket for the client tests.
 *
 * Two `TransformStream`s stand in for the byte streams a runtime adapter would
 * hand over, with the remote end in the test's hands, so every path runs
 * without a port.
 *
 * @module
 */

import { frame } from "@glion/mllp-codec";
import { decodeBytes, encodeBytes } from "@glion/util-charset";
import { vi } from "vitest";

import { MllpClient } from "../../src/index";
import type {
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

/**
 * A socket wired to two in-memory streams, with its far end in the test's
 * hands.
 */
export function stubSocket(
  opening: Opening = (streams) => Promise.resolve(streams)
) {
  const toClient = new TransformStream<Uint8Array, Uint8Array>();
  const fromClient = new TransformStream<Uint8Array, Uint8Array>();
  const outbound = toClient.writable.getWriter();
  const inbound = fromClient.readable.getReader();

  const streams: MllpStreams = {
    readable: toClient.readable,
    writable: fromClient.writable,
  };

  const close = vi.fn(async () => {
    try {
      await outbound.close();
    } catch {
      // The connection released its reader first, which already ended this
      // side; the socket's close is contracted never to reject.
    }
  });
  const connect = vi.fn((signal: AbortSignal) => opening(streams, signal));

  /** The next message the client wrote, as text. */
  async function received(): Promise<string> {
    const next = await inbound.read();
    if (next.done) {
      throw new Error("the client closed its writable side");
    }
    return decodeBytes(next.value);
  }

  /** The remote system answers with one framed message. */
  function replies(text: string): Promise<void> {
    return outbound.write(frame(encodeBytes(text)));
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
      hangsUp: () => outbound.close(),
      received,
      /** The remote system stops reading, so the client's next write fails. */
      refusesWrites: () => inbound.cancel(new Error("EPIPE")),
      replies,
      /** The remote system sends bytes, framed or not. */
      sends: (bytes: Uint8Array) => outbound.write(bytes),
      /** The signal the socket was given to open with. */
      get signal(): AbortSignal | undefined {
        return connect.mock.calls[0]?.[0];
      },
      /** The next bytes the client wrote. */
      async wrote(): Promise<Uint8Array | undefined> {
        const next = await inbound.read();
        return next.value;
      },
    },
    socket: { close, connect } satisfies MllpSocket,
    streams,
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
