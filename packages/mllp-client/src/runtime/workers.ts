/**
 * Cloudflare Workers runtime adapter for `MllpClient`: the socket a dial
 * function returns. Framing and stream ownership belong to the layer above.
 *
 * @module
 */

import type { connect } from "cloudflare:sockets";

import { MllpInvalidOptionError } from "../errors/mllp-invalid-option-error";
import type { MllpSocket, MllpStreams } from "../types";

type Socket = ReturnType<typeof connect>;

/**
 * Opens a connection to the remote system: `connect()` from
 * `cloudflare:sockets`, or a binding's `connect()`, with the runtime's
 * options. MUST return the socket itself, not a promise of it, and a fresh
 * one on every call. `secureTransport: "starttls"` is not supported.
 */
export type WorkersDial = () => Socket;

/**
 * A socket to one remote system, over the socket `dial` returns.
 *
 * Each `connect()` calls `dial` for a fresh socket.
 *
 * @throws {MllpInvalidOptionError} `dial` is not a function.
 */
export function workersSocket(dial: WorkersDial): MllpSocket {
  if (typeof dial !== "function") {
    throw new MllpInvalidOptionError(
      "`dial` is not a function; it must open a connection to the remote system."
    );
  }
  let open: Socket | undefined;

  return {
    async close(): Promise<void> {
      const socket = open;
      open = undefined;
      await socket?.close();
    },

    async connect(signal: AbortSignal): Promise<MllpStreams> {
      signal.throwIfAborted();
      // `dial()` returns at once with the connection still opening; `opened`
      // settles when the handshake does.
      const socket: Socket | Promise<Socket> = dial();
      if (socket instanceof Promise) {
        const resolved = await socket;
        // oxlint-disable-next-line promise/prefer-await-to-then -- awaiting would wait out the dial
        resolved.close().catch(() => {});
        throw new TypeError(
          "`dial` returned a promise; it must return the socket."
        );
      }
      // Raced, not awaited: `opened` alone would hold a cancelled attempt
      // until the dial times out. `listener` is the abort listener's
      // lifetime: aborting it removes the listener once the race is decided,
      // so nothing stays subscribed to `signal`.
      const listener = new AbortController();
      try {
        await Promise.race([socket.opened, aborted(signal, listener.signal)]);
      } catch (error) {
        // Two ways here: the dial failed (`opened` rejected), or the caller
        // cancelled. A failed dial is reported as it is. A cancelled one is
        // reported as the cancellation; its socket is closed without waiting,
        // since workerd settles that close only once the dial does, and then
        // with the dial's own failure, which nobody is left to act on.
        if (!signal.aborted) {
          throw error;
        }
        // oxlint-disable-next-line promise/prefer-await-to-then -- awaiting would wait out the dial
        socket.close().catch(() => {});
        throw signal.reason;
      } finally {
        listener.abort();
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
