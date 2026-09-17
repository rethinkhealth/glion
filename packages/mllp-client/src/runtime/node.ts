/**
 * Node runtime adapter for `MllpClient`: one `net.Socket`, or `tls.TLSSocket`
 * when `tls` is set, ended gracefully first and forced after a grace period.
 * Closing resolves in bounded time.
 *
 * @module
 */

import { connect as connectTcp, isIP } from "node:net";
import type { Socket } from "node:net";
import { Duplex } from "node:stream";
import { connect as connectTls } from "node:tls";
import type { ConnectionOptions } from "node:tls";

import type { MllpSocket, MllpStreams } from "../types";

/** Default time a socket gets to end gracefully before it is destroyed. */
export const DEFAULT_GRACEFUL_CLOSE_MS = 1000;

/** Default idle time before the first keepalive probe. */
export const DEFAULT_KEEPALIVE_IDLE_MS = 30_000;

/** TLS settings for {@link nodeSocket}, as Node's `tls.connect()` takes them. */
export type NodeTlsOptions = Pick<
  ConnectionOptions,
  | "ca"
  | "cert"
  | "key"
  | "passphrase"
  | "pfx"
  | "rejectUnauthorized"
  | "servername"
>;

export interface NodeSocketOptions {
  /** Host name or address of the remote system. */
  readonly host: string;
  /** TCP port of the remote system. */
  readonly port: number;
  /**
   * TLS for the connection. `true`: verify the remote system's certificate
   * against the runtime's trusted CAs, for `host`, sent as the server name
   * (SNI) unless `host` is an IP address. An object: the same, with Node's
   * `tls.connect()` options applied. `ca` replaces the runtime's trusted CAs.
   * `cert` and `key` present a client certificate. `servername` replaces
   * `host` as the server name. `false`: plain TCP.
   *
   * A remote system dialed by IP address MUST present a certificate for that
   * address, or `servername` MUST name one the certificate lists.
   *
   * @default false
   */
  readonly tls?: boolean | NodeTlsOptions;
  /**
   * Time a socket gets to end gracefully before it is destroyed, in
   * milliseconds.
   *
   * @default 1_000.
   */
  readonly gracefulCloseMs?: number;
  /**
   * Idle time before the first keepalive probe, in milliseconds. Once the
   * probes fail, the OS ends the socket, and the next send fails at once with
   * `CONNECTION_LOST` instead of waiting out `sendTimeoutMs`.
   *
   * @default 30_000.
   */
  readonly keepAliveIdleMs?: number;
}

/**
 * Dials one socket and resolves it once the connection is open: after the TLS
 * handshake when `tls` is set, plain TCP when it is `undefined`.
 *
 * Rejects with the socket's error, or with `signal.reason` when cancelled.
 * Destroys the socket before rejecting.
 */
function dial(
  host: string,
  port: number,
  tls: NodeTlsOptions | undefined,
  keepAliveIdleMs: number,
  signal: AbortSignal
): Promise<Socket> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping a Node event emitter
  return new Promise<Socket>((resolve, reject) => {
    signal.throwIfAborted();

    const done = () => {
      socket.removeListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const onOpened = () => {
      done();
      resolve(socket);
    };
    const onError = (error: Error) => {
      done();
      socket.destroy();
      reject(error);
    };
    const onAbort = () => {
      done();
      socket.destroy();
      reject(signal.reason);
    };

    // `tls.connect()` sends SNI only when `servername` is set. An IP address is
    // never a server name (RFC 6066 §3).
    const servername = isIP(host) ? undefined : host;
    const socket = tls
      ? connectTls({ servername, ...tls, host, port }, onOpened)
      : connectTcp({ host, port }, onOpened);
    socket.once("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });

    // No Nagle — MLLP acknowledgments are tiny and latency-sensitive.
    socket.setNoDelay(true);
    socket.setKeepAlive(true, keepAliveIdleMs);
  });
}

/**
 * Ends a socket: FIN first, then destroy if the remote system does not answer.
 *
 * The grace window avoids the FIN-immediately-followed-by-RST sequence that
 * some integration engines log as a protocol error.
 */
function end(socket: Socket, gracefulCloseMs: number): Promise<void> {
  if (socket.destroyed || socket.closed) {
    return Promise.resolve();
  }
  // oxlint-disable-next-line promise/avoid-new -- wrapping a Node event emitter
  return new Promise<void>((resolve) => {
    const grace = setTimeout(() => {
      if (!socket.destroyed) {
        socket.destroy();
      }
    }, gracefulCloseMs);
    socket.once("close", () => {
      clearTimeout(grace);
      // oxlint-disable-next-line promise/no-multiple-resolved -- `once`
      resolve();
    });
    socket.end();
  });
}

/**
 * A TCP socket to one remote system, over Node's `net` module, or its `tls`
 * module when `tls` is set.
 *
 * Each `connect()` dials a fresh socket: Node cannot reconnect one that has
 * been destroyed.
 */
export function nodeSocket(opts: NodeSocketOptions): MllpSocket {
  const gracefulCloseMs = opts.gracefulCloseMs ?? DEFAULT_GRACEFUL_CLOSE_MS;
  const keepAliveIdleMs = opts.keepAliveIdleMs ?? DEFAULT_KEEPALIVE_IDLE_MS;
  const tls = opts.tls === true ? {} : opts.tls || undefined;
  /** Ends whatever `connect()` last opened. Nothing is open to begin with. */
  let closeOpen = (): Promise<void> => Promise.resolve();

  return {
    close: () => closeOpen(),

    async connect(signal: AbortSignal): Promise<MllpStreams> {
      const socket = await dial(
        opts.host,
        opts.port,
        tls,
        keepAliveIdleMs,
        signal
      );
      closeOpen = () => end(socket, gracefulCloseMs);

      const web = Duplex.toWeb(socket);
      return {
        readable: web.readable as ReadableStream<Uint8Array>,
        writable: web.writable as WritableStream<Uint8Array>,
      };
    },
  };
}
