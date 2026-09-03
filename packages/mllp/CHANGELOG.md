# @rethinkhealth/hl7v2-mllp

## 0.18.0

### Minor Changes

- 64d78d6: `@glion/mllp-transport` is renamed to `@glion/mllp-codec`; `frame` / `unframe` become its whole surface, and protocol failures now speak in messages, not frames.
  - **Package renamed:** `@glion/mllp-transport` → `@glion/mllp-codec`. The package is a pure encoder/decoder pair with no socket or runtime dependency; the new name says so. Update installs and imports; the npm history stays under the old name, and `@glion/mllp-transport` will be `npm deprecate`d at this release pointing here — its last published decoder predates the frame-gluing and trickle-scan fixes, so do not stay on it.
  - **`FramingError` → `MllpCodecError`** (and `FramingErrorCode` → `MllpCodecErrorCode`), with codes renamed for what the consumer experiences: `MISSING_START_BLOCK` → `UNEXPECTED_DATA`, `MISSING_END_BLOCK` → `INCOMPLETE_MESSAGE`, `FRAME_TOO_LARGE` → `MESSAGE_TOO_LARGE`, `EMBEDDED_CONTROL_CHAR` → `RESERVED_CHARACTER`. Every message text was rewritten in the same vocabulary — messages and reserved characters, not frames and blocks.

  - **`unframe(options?)`** — a `TransformStream<Uint8Array, Uint8Array>`: pipe the wire's byte stream through it and read complete MLLP payloads, one HL7v2 message per chunk, with partial and coalesced frames reassembled across reads. Framing violations error the stream with a typed `MllpCodecError`.
  - **Removed:** `createFrameDecoder`, `FrameDecoder`, `FrameDecoderOptions`, `FrameDecoderStream`, `decode`, and `validate`. The push-based engine lives on internally behind `unframe`; `frame` runs the reserved-byte check itself (`validate` folded in, so string payloads are encoded once instead of twice); one-shot `decode` had no consumer — `unframe` is the single inbound door. Migrate `socket.readable.pipeThrough(new FrameDecoderStream(opts))` → `socket.readable.pipeThrough(unframe(opts))`; `FrameDecoderOptions` → `UnframeOptions`; `validate(payload)` → `frame(payload)` (same check, discard the result).
  - **`frame()` takes bytes only.** The `string` overload is removed: the codec is content-opaque — it cannot read the message's MSH-18 character-set declaration, so it must not choose a wire encoding either (the old overload silently UTF-8-encoded, bypassing the charset layer and able to contradict a declared MSH-18). Encode where the declaration is visible and pass bytes: `frame(text)` → `frame(encodeBytes(text))` (`encodeBytes` from `@glion/util-charset`). Charset transparency — including the structural impossibility of carrying UTF-16 over MLLP — is now pinned by a dedicated test suite.
  - **Frames can never glue.** An MLLP start marker (VT, `0x0B`) appearing inside an unterminated frame now errors the stream with `RESERVED_CHARACTER`, eagerly — the moment the second VT is seen. A sender that stalls mid-frame and then starts its next message can no longer have two messages fused into one payload — the rule `frame` already enforces outbound. An embedded lone FS (not followed by CR) remains payload content, matching Mirth Connect and HAPI.
  - **Trickle-proof scanning.** The streaming decoder was rewritten as a single-cursor scan: bytes are classified left-to-right exactly once, the next FS decides what follows, and an FS at the buffer's end simply waits for its successor (that one rule replaces split-terminator arithmetic). A sender trickling a large frame in small chunks previously cost O(buffered) per chunk — a CPU soft spot alongside the existing `maxBufferedBytes` memory bound — and the FS search also walked stale buffer capacity past the live bytes. Measured on a 64 KiB frame in 64 B chunks: ~44.6 → ~1,040 ops/s (22.4 ms → ~1.0 ms per frame, ~23×); the residual is Web Streams per-chunk overhead, and the old gap widened quadratically with frame size. Guarded by trickle benchmarks in the package (`pnpm --filter @glion/mllp-codec bench`) and in the CodSpeed suite.
  - `@glion/mllp`'s Node server now reads through `unframe()`. A glued inbound message tears that connection down with a protocol error instead of being absorbed as one corrupted payload.
  - **The server is never silent about a byte-stream violation.** `@glion/mllp` translates an inbound framing violation — or a handler response carrying a reserved VT/FS byte that cannot be framed — into `MllpServerError` `PROTOCOL_VIOLATION` (codec error on `cause`) and routes it to `onError` before closing the connection, instead of swallowing it as transport noise.

- 5d81ea0: Add `@glion/util-charset` and decode inbound HL7v2 wire bytes through it, so a non-UTF-8 feed fails loudly instead of being silently corrupted to U+FFFD (#659).
  - Add `@glion/util-charset` with `decodeBytes(bytes)` and `encodeBytes(text)` for UTF-8 — decoding is fatal and strips a leading UTF-8 BOM
  - Add the `CharsetError` class (carrying `code: "INCOMPATIBLE_CHARSET"`), thrown by `decodeBytes` on a non-UTF-8 byte-order mark or otherwise-invalid UTF-8
  - Change the MLLP server to decode payloads via `decodeBytes`; a non-UTF-8 message now surfaces through `onError` as `MllpServerError` (`code` `INCOMPATIBLE_CHARSET`) instead of being decoded to U+FFFD and acknowledged as valid. The codec's `CharsetError` is kept on `cause`, never leaked to consumers
  - Change the MLLP client to decode ACKs via `decodeBytes`; a non-UTF-8 ACK now rejects with `MllpErrorCode.INVALID_RESPONSE`, with the `CharsetError` on `cause`
  - Add `MllpServerErrorCode.INCOMPATIBLE_CHARSET`. Consumers branch on each package's own error vocabulary (`MllpServerError`/`MllpClientError`) and never import `@glion/util-charset`

### Patch Changes

- e260ee4: `Hl7v2Processor` — the unified processor type every HL7v2 pipeline satisfies — is exported from `@glion/parser`, its ecosystem home. `@glion/mllp` re-exports it unchanged. Its head and tail admit `undefined` (`Processor<Root, Root | undefined, Root | undefined>`), so the bare `unified().use(hl7v2Parser).freeze()` is assignable alongside full transformer/compiler pipelines like `@glion/hl7v2`'s `parseHL7v2` — no casts needed. The package's public d.ts types now come from real dependencies (`@glion/ast`, `@glion/config`, `@types/unist` moved into `dependencies`).
- 7715edf: Remove `@glion/mllp-ack` from the ecosystem: `ackMiddleware` and `acknowledge()` are retired ahead of built-in acknowledgment translation at the framework's error boundary in `@glion/mllp` (ADR 0019).
  - Remove `@glion/mllp-ack` from quick-start snippets and package catalogs; apps reply by returning a `Response` or via `app.onError()` until the built-in translation lands
  - Remove the `@glion/mllp-ack` workspace dependency from `@glion/cli`

- Updated dependencies [64d78d6]
- Updated dependencies [e260ee4]
- Updated dependencies [5d81ea0]
  - @glion/mllp-codec@0.18.0
  - @glion/parser@0.18.0
  - @glion/util-charset@0.18.0
  - @glion/util-query@0.18.0
  - @glion/ast@0.18.0

## 0.17.0

### Minor Changes

- 58de708: Migrate the server to the new `@glion/mllp-transport` API (`frame` / `FrameDecoderStream`). The package no longer re-exports the transport surface — import `@glion/mllp-transport` directly. A missing parser now throws `MllpServerError` (`NO_PARSER`) instead of a transport error, and the Node adapter tears connections down gracefully (FIN) so a rejected `onConnect` no longer resets the peer.

### Patch Changes

- Updated dependencies [58de708]
  - @glion/mllp-transport@0.17.0
  - @glion/ast@0.17.0
  - @glion/parser@0.17.0
  - @glion/util-query@0.17.0

## 0.16.0

### Minor Changes

- 5e3d97e: Bump `engines.node` from `>=18` to `>=20` across all `@glion/*` packages.

  Node 18 reaches end-of-life in April 2026; new code in this repo uses
  Node 20+ APIs (notably `AbortSignal.any()` in `@glion/mllp-client`),
  and standardising on a single supported Node line keeps the
  dependency matrix coherent across the monorepo.

  Downstream impact: applications that pin Node 18 will need to upgrade
  to Node 20 or later. Node 20 is itself in active LTS and remains
  supported until April 2026; Node 22 is the current LTS.

- 5e3d97e: Extract MLLP wire-protocol primitives into a new package, `@glion/mllp-transport`. The new package owns the framing constants, encoder, decoder, decoder stream, base `MllpError` class, and `TransportError` subclass — everything that is independent of whether you are building a server or a client.

  `@glion/mllp` (the server framework) now depends on `@glion/mllp-transport` and re-exports the same symbols from its top-level entry, so existing consumers see no API change. New code can import transport primitives directly from `@glion/mllp-transport`.

  `@glion/mllp-client` now depends on `@glion/mllp-transport` instead of `@glion/mllp`. The client no longer pulls in the server framework just to access the wire codec.

### Patch Changes

- Updated dependencies [5e3d97e]
- Updated dependencies [5e3d97e]
- Updated dependencies [07c48c4]
- Updated dependencies [5e3d97e]
- Updated dependencies [b7bdd6a]
  - @glion/ast@0.16.0
  - @glion/mllp-transport@0.16.0
  - @glion/parser@0.16.0
  - @glion/util-query@0.16.0

## 0.15.3

### Patch Changes

- @glion/ast@0.15.3
- @glion/parser@0.15.3
- @glion/util-query@0.15.3

## 0.15.2

### Patch Changes

- @glion/ast@0.15.2
- @glion/parser@0.15.2
- @glion/util-query@0.15.2

## 0.15.1

### Patch Changes

- @glion/ast@0.15.1
- @glion/parser@0.15.1
- @glion/util-query@0.15.1

## 0.15.0

### Minor Changes

- 4aa0b44: Fix telemetry middleware not capturing ACK codes when `ackMiddleware()` is used.

  The TUI displayed `?` instead of `AA`/`AE`/`AR` because the telemetry middleware was installed as the innermost middleware, causing it to read `ctx.res` before the outer `ackMiddleware` had set it. Telemetry is now prepended (outermost) so its `await next()` completes after all user middleware have run.
  - Add `{ prepend: true }` option to `Mllp.use()` for inserting middleware at the front of the chain
  - Prepend the glion telemetry middleware so it wraps ackMiddleware correctly

### Patch Changes

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.
- Updated dependencies [4af9499]
  - @glion/ast@0.15.0
  - @glion/parser@0.15.0
  - @glion/util-query@0.15.0

## 0.14.1

### Patch Changes

- Updated dependencies [1739fc8]
  - @rethinkhealth/hl7v2-parser@0.14.1
  - @rethinkhealth/hl7v2-ast@0.14.1
  - @rethinkhealth/hl7v2-util-query@0.14.1

## 0.14.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.14.0
- @rethinkhealth/hl7v2-parser@0.14.0
- @rethinkhealth/hl7v2-util-query@0.14.0

## 0.13.2

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.13.2
- @rethinkhealth/hl7v2-parser@0.13.2
- @rethinkhealth/hl7v2-util-query@0.13.2

## 0.13.1

### Patch Changes

- c9fe3ee: Migrate build toolchain from tsup to tsdown
  - Switched JS bundler from tsup (esbuild) to tsdown (Rolldown) across all packages
  - `hl7v2-profiles` now uses Rolldown's `codeSplitting` to merge ~10,800 tiny chunks into ~170 larger ones, significantly improving install and build performance
  - No public API changes — this is a build internals change only

- Updated dependencies [c9fe3ee]
  - @rethinkhealth/hl7v2-parser@0.13.1
  - @rethinkhealth/hl7v2-util-query@0.13.1
  - @rethinkhealth/hl7v2-ast@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [575978f]
  - @rethinkhealth/hl7v2-ast@0.13.0
  - @rethinkhealth/hl7v2-parser@0.13.0
  - @rethinkhealth/hl7v2-util-query@0.13.0

## 0.12.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.12.0
- @rethinkhealth/hl7v2-parser@0.12.0
- @rethinkhealth/hl7v2-util-query@0.12.0

## 0.11.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.11.0
- @rethinkhealth/hl7v2-parser@0.11.0
- @rethinkhealth/hl7v2-util-query@0.11.0

## 0.10.1

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.10.1
- @rethinkhealth/hl7v2-parser@0.10.1
- @rethinkhealth/hl7v2-util-query@0.10.1

## 0.10.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.10.0
- @rethinkhealth/hl7v2-parser@0.10.0
- @rethinkhealth/hl7v2-util-query@0.10.0

## 0.9.0

### Patch Changes

- 9e40900: Fix composite VID handling in MSH-12. `value()` now drills to the first child for composite fields, and all packages explicitly use `MSH-12.1` for version extraction. Also removes redundant "missing version" messages from profile lint rules — `lint-message-version` is the single authority. Changes `file.fail()` to `file.message()` in `lint-message-version` so user configuration controls severity.
- Updated dependencies [9e40900]
  - @rethinkhealth/hl7v2-util-query@0.9.0
  - @rethinkhealth/hl7v2-ast@0.9.0
  - @rethinkhealth/hl7v2-parser@0.9.0

## 0.8.0

### Minor Changes

- f3598e0: Replace constructor-option parser with `app.parser()` lifecycle stage and implement lazy pipeline execution (ADR-0013).
  - Remove `MllpOptions`, `Parser`, `ParseResult` types — `app.parser()` accepts `Hl7v2Processor` (unified `Processor<Root, Root, Root>`) directly
  - Add `ctx.ast` — synchronous access to the parsed AST for routing, ACK building, and filter functions
  - Change `ctx.tree` from a sync property to `ctx.tree()` async method — triggers `run()` (transformers) lazily on first call, cached thereafter
  - Add `ctx.result()` async method — triggers `run()` + `stringify()` lazily on first call, returns compiled output (e.g., JSON from `hl7v2Jsonify`), `undefined` when no compiler is configured
  - Change `ctx.file` from `VFile | undefined` to `VFile` — always present, diagnostics accumulate after `tree()` triggers transformers
  - Add `Hl7v2Processor` exported type alias for `Processor<Root, Root, Root>`
  - Throw `MllpError` with code `ERR_NO_PARSER` when `handle()` called without `app.parser()`
  - Change ACK middleware to use `ctx.ast` instead of `ctx.tree` for zero-async acknowledgment generation

### Patch Changes

- Updated dependencies [64da535]
  - @rethinkhealth/hl7v2-util-query@0.8.0
  - @rethinkhealth/hl7v2-ast@0.8.0
  - @rethinkhealth/hl7v2-parser@0.8.0

## 0.7.1

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.7.1
- @rethinkhealth/hl7v2-parser@0.7.1
- @rethinkhealth/hl7v2-util-query@0.7.1

## 0.7.0

### Patch Changes

- @rethinkhealth/hl7v2-ast@0.7.0
- @rethinkhealth/hl7v2-parser@0.7.0
- @rethinkhealth/hl7v2-util-query@0.7.0

## 0.6.0

### Patch Changes

- 0f0af81: ### New Package: `@rethinkhealth/hl7v2-mllp`

  Transport-agnostic MLLP (Minimal Lower Layer Protocol) engine for HL7v2 messaging — primitives, streaming, and a Hono-style middleware server.

  **Transport Layer:**
  - **Frame encoding/decoding** — `encode()`, `decode()`, `encodeMultiple()` for one-shot MLLP framing operations.
  - **Streaming decoder** — `createDecoderStream()` and `MLLPDecoderStream` class implement a resilient two-state finite state machine that handles arbitrary TCP chunk boundaries, reports framing errors via callback, and never throws.
  - **DynamicBuffer** — Geometric-growth byte buffer (O(n) amortized) for efficient stream accumulation without O(n²) concat overhead.
  - **Size enforcement** — `maxMessageSize` option bounds memory usage both mid-accumulation and on frame completion.

  **Server Layer (Hono-style API):**
  - **`Mllp` class** — Pure routing and middleware engine with `.use()`, `.on()`, `.onError()`, and `.handle()`. No TCP concerns.
  - **Middleware composition** — Hono/Koa onion model with `(ctx, next)` signature. Supports short-circuiting, scoped middleware (by pattern or filter function), and last-write-wins response semantics.
  - **Pattern-based routing** — `"ADT^A01"` (exact), `"ADT^*"` (wildcard trigger), `"*^A01"` (wildcard type), `"*"` (catch-all). First-match-wins ordering.
  - **Filter function routing** — `app.on((ctx) => ctx.version === "2.5.1", handler)` for matching on any context property.
  - **Context** — Immutable `req` and `connection`, parsed AST (`ctx.tree`), MSH field extraction (messageType, triggerEvent, controlId, version), per-message variables via `ctx.set()`/`ctx.get()`.
  - **Custom parser support** — Constructor option `new Mllp({ parser })` accepts sync or async parsers (e.g., unified processor).

  **Node.js Adapter (`@rethinkhealth/hl7v2-mllp/node`):**
  - **`serve(app, options)`** — Binds an `Mllp` app to a TCP or TLS port. Handles the decode-handle-encode loop per connection with proper resource cleanup.
  - **TLS support** — Pass `tls: { cert, key }` to `serve()` options.
  - **Socket configuration** — TCP keep-alive, idle timeouts, Nagle disabled (`setNoDelay`), backpressure-aware writes.
  - **Platform-agnostic adapter interface** — `TcpAdapter` / `AdapterSocket` abstractions use Web Streams, enabling future Bun/Deno adapters.

  **Design Decisions:**
  - Errors are silently absorbed by default (no response sent); the sending system times out and retries per standard MLLP behavior. ACK/NAK generation belongs in middleware, not the core.
  - Zero built-in logging — logging is an opt-in middleware concern, same philosophy as Hono.
  - Middleware-first architecture — logging, acknowledgment, error translation are all composable middleware.

- 1f73b98: Remove tree.data.messageInfo from all packages. Delete hl7v2-annotate-message and hl7v2-util-message-info packages. Rename hl7v2-annotate-message-structure to hl7v2-message-structure. All packages now read MSH fields directly via value() from hl7v2-util-query.
- Updated dependencies [7763c22]
- Updated dependencies [0b57ba9]
  - @rethinkhealth/hl7v2-util-query@0.6.0
  - @rethinkhealth/hl7v2-parser@0.6.0
  - @rethinkhealth/hl7v2-ast@0.6.0
