/**
 * Cloudflare Workers runtime adapter for `MllpClient`: one socket over
 * `cloudflare:sockets`. Framing and stream ownership belong to the layer
 * above.
 *
 * @module
 */

import { connect } from "cloudflare:sockets";

import type { MllpSocket, MllpStreams } from "../types";

type Socket = ReturnType<typeof connect>;

export interface WorkersSocketOptions {
  /** Host name or address of the remote system. */
  readonly host: string;
  /** TCP port of the remote system. */
  readonly port: number;
}

/**
 * A TCP socket to one remote system, over `cloudflare:sockets`.
 *
 * Each `connect()` opens a fresh socket. Plain TCP only; TLS is tracked in
 * #657.
 */
export function workersSocket(opts: WorkersSocketOptions): MllpSocket {
  let open: Socket | undefined;

  return {
    async close(): Promise<void> {
      const socket = open;
      open = undefined;
      await socket?.close();
    },

    async connect(signal: AbortSignal): Promise<MllpStreams> {
      signal.throwIfAborted();
      // `connect()` returns at once with the dial in progress; `opened`
      // settles when the handshake does.
      const socket = connect(
        { hostname: opts.host, port: opts.port },
        { allowHalfOpen: false, secureTransport: "off" }
      );
      // Raced, not awaited: `opened` alone would hold a cancelled attempt
      // until the dial times out. `attempt` unhooks the abort listener once
      // the race is decided, so nothing stays subscribed to `signal`.
      const attempt = new AbortController();
      try {
        await Promise.race([socket.opened, aborted(signal, attempt.signal)]);
      } catch (error) {
        // Two ways here: the dial failed (`opened` rejected), or the caller
        // cancelled. A failed dial is reported as it is. A cancelled one is
        // reported as the cancellation, and the socket is discarded without
        // waiting, since its close settles only once the dial does.
        if (!signal.aborted) {
          throw error;
        }
        void discard(socket);
        throw signal.reason;
      } finally {
        attempt.abort();
      }
      // Only an opened socket is held, so `close()` has something to end
      // exactly when `connect()` fulfilled.
      open = socket;
      return { readable: socket.readable, writable: socket.writable };
    },
  };
}

/**
 * Rejects with `signal.reason` once `signal` aborts, unless `until` aborts
 * first.
 */
function aborted(signal: AbortSignal, until: AbortSignal): Promise<never> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping an abort event
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
      signal: until,
    });
  });
}

/**
 * Ends a socket whose attempt was cancelled. workerd settles that close only
 * once the attempt itself settles, and with the attempt's own failure.
 */
async function discard(socket: Socket): Promise<void> {
  try {
    await socket.close();
  } catch {
    // The cancelled attempt's failure; `connect()` already rejected with the
    // cancellation, and nothing is open.
  }
}
