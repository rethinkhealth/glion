/**
 * The same connection an adapter hands over, counted in messages instead of
 * bytes.
 *
 * `MllpConnection` — the public adapter contract — is a pair of byte streams.
 * The actor never wants bytes: it writes one message and reads the one that
 * answers it. This module is that translation, and the only place in the
 * package that touches a stream: pipe the readable through `unframe`, hold
 * the writer for the connection's lifetime, and release both locks on close.
 *
 * Keeping it here is what lets `actor.ts` name no stream type at all, so the
 * lifecycle tests hand the actor a three-method fake and settle each read and
 * write by hand.
 *
 * @module
 */

import { unframe } from "@glion/mllp-codec";

import type { MllpConnector } from "./types";

/** One open connection, in whole MLLP messages. Owned by the actor. */
export interface FramedConnection {
  /** Writes one complete MLLP frame. */
  write(framed: Uint8Array): Promise<void>;
  /** The next message from the remote system, or `null` at end of stream. */
  read(): Promise<Uint8Array | null>;
  /** Ends the connection. Idempotent; never rejects; bounded in time. */
  close(): Promise<void>;
}

export interface OpenFramedConnectionOptions {
  readonly connect: MllpConnector;
  readonly host: string;
  readonly port: number;
  readonly maxBufferedBytes: number;
  readonly signal: AbortSignal;
}

/**
 * Opens one connection and frames it.
 *
 * Rejects with whatever the connector raised, thrown or rejected alike; the
 * actor is what classifies it. A connection that opens after the actor has
 * stopped waiting still arrives here intact — disposing of it is the actor's
 * job, not this function's.
 */
export async function openFramedConnection(
  opts: OpenFramedConnectionOptions
): Promise<FramedConnection> {
  const connection = await opts.connect({
    host: opts.host,
    port: opts.port,
    signal: opts.signal,
  });

  const reader = connection.readable
    .pipeThrough(unframe({ maxBufferedBytes: opts.maxBufferedBytes }))
    .getReader();
  const writer = connection.writable.getWriter();
  let closing: Promise<void> | null = null;

  return {
    close(): Promise<void> {
      if (closing === null) {
        closing = (async () => {
          // Release the streams, do not cancel them: cancelling would destroy
          // the socket under the adapter and skip its graceful close. A read
          // parked on the released reader rejects, and the actor recognises
          // that rejection as a straggler of a send that is already over.
          reader.releaseLock();
          writer.releaseLock();
          await connection.close();
        })();
      }
      return closing;
    },
    async read(): Promise<Uint8Array | null> {
      const next = await reader.read();
      return next.done ? null : next.value;
    },
    write(framed: Uint8Array): Promise<void> {
      return writer.write(framed);
    },
  };
}
