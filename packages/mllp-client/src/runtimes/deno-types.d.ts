/**
 * Ambient type declarations for the Deno runtime globals used by the
 * Deno adapter.
 *
 * ## Why a local ambient declaration instead of an npm types package
 *
 * Deno's official types ship with the runtime itself; there is no
 * actively-maintained npm equivalent of `@cloudflare/workers-types`.
 * `@deno/types` and `@types/deno` both exist on npm but are stuck at
 * version `0.0.1` (last published years ago) with no real usage. The
 * Deno team's recommended typing approach lives in `deno.json`'s
 * `compilerOptions.types`, which does not help npm packages that
 * ship a Deno adapter.
 *
 * The narrow declaration here covers exactly the four symbols we
 * touch (`connect`, `connectTls`, `TcpConn`, plus the two option
 * shapes). The `Deno.connect*` API is API-stable, so the drift
 * surface is small. Re-evaluate this choice if Deno ever publishes
 * official types as an npm package.
 *
 * This file has no `import`/`export` so it is treated as a script —
 * the top-level `declare namespace` lands directly in the global
 * scope without needing a `declare global` block.
 *
 * @internal
 */

// oxlint-disable-next-line typescript-eslint/no-namespace
declare namespace Deno {
  interface TcpConn {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
    close(): void;
  }
  interface ConnectOptions {
    hostname: string;
    port: number;
  }
  interface ConnectTlsOptions extends ConnectOptions {
    caCerts?: string[];
    certChain?: string;
    privateKey?: string;
  }
  function connect(options: ConnectOptions): Promise<TcpConn>;
  function connectTls(options: ConnectTlsOptions): Promise<TcpConn>;
}
