/**
 * Cloudflare Workers runtime adapter for `MllpClient`.
 *
 * Opens a socket through `cloudflare:sockets` and closes it through the
 * same. Framing and stream ownership belong to the layer above.
 *
 * @module
 */

import { connect } from "cloudflare:sockets";

import type { MllpSocket, MllpStreams } from "../types";

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
  let closeOpen = (): Promise<void> => Promise.resolve();

  return {
    close: () => closeOpen(),

    async connect(signal: AbortSignal): Promise<MllpStreams> {
      if (signal.aborted) {
        throw signal.reason;
      }
      const socket = connect(
        { hostname: opts.host, port: opts.port },
        { allowHalfOpen: false, secureTransport: "off" }
      );

      let onAbort: (() => void) | undefined;
      // oxlint-disable-next-line promise/avoid-new -- wrapping an abort event
      const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
      });
      try {
        await Promise.race([socket.opened, aborted]);
      } catch (error) {
        // workerd settles `close()` on a socket that never opened only once
        // the attempt itself settles, and then rejects it with the attempt's
        // own error. Nothing is open to end, so neither is waited for.
        // oxlint-disable-next-line promise/prefer-await-to-then -- see above
        void socket.close().catch(() => {});
        throw signal.aborted ? signal.reason : error;
      } finally {
        if (onAbort) {
          signal.removeEventListener("abort", onAbort);
        }
      }

      closeOpen = () => socket.close();
      return { readable: socket.readable, writable: socket.writable };
    },
  };
}
