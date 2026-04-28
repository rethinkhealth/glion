/**
 * Ambient type declarations for Cloudflare's `cloudflare:sockets`
 * runtime module.
 *
 * ## Why a local ambient declaration instead of `@cloudflare/workers-types`
 *
 * The official `@cloudflare/workers-types` package is auto-generated
 * from the workerd runtime and would be the natural source of truth.
 * Unfortunately it has no scoped entry — `index.d.ts` declares Workers
 * globals (`ReadableStream`, `WritableStream`, `AbortController`,
 * `Event`, `Request`, `Response`, …) at the top level, and the
 * `declare module "cloudflare:sockets"` block depends on those globals.
 * Loading the package (even via a `/// <reference types=` scoped to
 * `workers.ts`) overrides built-in Web Streams types project-wide,
 * which conflicts with the Node adapter's `node:stream/web` types.
 *
 * The narrow declaration here covers exactly the four types we touch
 * (`connect`, `SocketOptions`, `WorkerSocket`, `SocketInfo`). The
 * `cloudflare:sockets` API is API-stable and rarely changes, so the
 * drift surface is small. Re-evaluate this choice if Cloudflare ever
 * publishes a `cloudflare:sockets`-only entry that does not pull in
 * runtime globals.
 *
 * @internal
 */
declare module "cloudflare:sockets" {
  export function connect(
    addressOrUrl: string | { hostname: string; port: number },
    options?: SocketOptions
  ): WorkerSocket;

  export interface SocketOptions {
    secureTransport?: "on" | "off" | "starttls";
    allowHalfOpen?: boolean;
  }

  export interface WorkerSocket {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    closed: Promise<void>;
    opened: Promise<SocketInfo>;
    close(): Promise<void>;
    startTls(): WorkerSocket;
  }

  export interface SocketInfo {
    remoteAddress: string;
    localAddress: string;
  }
}
