---
"@glion/mllp-client": minor
---

Make `@glion/mllp-client` runtime-agnostic. The package now ships four entry points, one core + three runtime adapters:

- `@glion/mllp-client` — Node and Bun (default; same DX as before)
- `@glion/mllp-client/deno` — Deno
- `@glion/mllp-client/workers` — Cloudflare Workers
- `@glion/mllp-client/core` — runtime-free; supply your own `connect` (custom transports, browser-via-WebSocket bridges, in-memory test pipes)

Bundlers that honour the `workerd` and `deno` keys in `package.json` `exports` automatically pick the right entry when you import the bare `@glion/mllp-client`. The explicit subpaths exist for clarity and for monorepos that mix runtimes.

The user-facing API is identical across all four entries — `new MllpClient({ host, port }).send(message)` — so application code only changes one word in its import path when targeting a non-Node runtime.

**Breaking change:** the package internals are restructured. The only public symbol that moved is the `MllpClient` class itself, and only for callers who reached into `@glion/mllp-client/dist/...` or `node:net`-specific options:

- `MllpClientTlsOptions.ca | cert | key` is now `string | Uint8Array` instead of `string | Buffer`. `Buffer` extends `Uint8Array`, so existing Node callers still work without changes.
- The Node socket plumbing is no longer exposed at module scope; if you imported `nodeConnect` for advanced use, it remains available from `@glion/mllp-client/node`.

Internals: the core `exchange()` now operates on a Web-Streams `MllpDuplexStream` instead of a Node `Socket`, and `MllpClient.send()` accepts a pluggable `connect: MllpConnect` function.

Tests cover all four entry points:

- `test/node.test.ts` — 14 tests against a real local TCP server (existing).
- `test/core.test.ts` — 9 tests using a fake in-memory connector to prove the core has no runtime coupling.
- `test/deno.test.ts` — 6 tests that monkey-patch `globalThis.Deno` and verify the Deno adapter's wiring.
- `test/workers.test.ts` — 6 tests that mock `cloudflare:sockets` via `vi.mock()` and verify the Workers adapter's wiring.

Total: 35 tests, all passing in vitest. Each adapter is verified in isolation; the core protocol logic is verified separately against an in-memory transport.
