/**
 * The subset of `cloudflare:sockets` the Workers adapter uses.
 *
 * Declared here rather than through `@cloudflare/workers-types`, which
 * redeclares Web Streams and other globals project-wide and conflicts with
 * `@types/node`. Shape per
 * https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/.
 */
declare module "cloudflare:sockets" {
  export interface SocketAddress {
    readonly hostname: string;
    readonly port: number;
  }

  export interface SocketOptions {
    readonly secureTransport?: "off" | "on" | "starttls";
    readonly allowHalfOpen?: boolean;
  }

  export interface Socket {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
    readonly opened: Promise<unknown>;
    readonly closed: Promise<void>;
    close(): Promise<void>;
    startTls(): Socket;
  }

  export function connect(
    address: SocketAddress | string,
    options?: SocketOptions
  ): Socket;
}
