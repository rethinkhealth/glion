# MLLP client SDK — from-first-principles rebuild

Plan owner: melek@synapshealth.com
Branch: `claude/persistent-connection-mvp`
Safety tag: `archive/persistent-connection-mvp-pre-rebuild` (= `486b05a6`)

## Why a rebuild

The persistent-connection MVP shipped through six rounds of iteration. The latest code review surfaced systemic issues that aren't local fixes:

- A memory leak in `#raceCycleAgainstSignal` (caller signals accumulate listeners).
- A doc/behaviour contradiction: `connect()` claims fail-fast, default-on reconnect retries forever.
- Three abstractions admitted by their own JSDoc to exist only to fight the implementation (`#startCycle`, `#isTerminal`, `#raceCycleAgainstSignal`).
- Triple-state inside `#runConnectCycle` (`attempt` / `pendingDelayMs` / `lastCause`) with an unreachable guard hinting the relationship isn't modelled cleanly.
- Microtask race between cycle settlement and `#handleSocketLoss` that can leave the socket stuck at `Reconnecting`.
- Zero direct test coverage of the headline reconnect feature.
- `MllpDispatcher` interface introduced for a single implementor with no second consumer in sight.

These come from layered patching, not from a coherent design. The right move is to start over with the wire spec, define the smallest correct kernel, and grow the surface only when tests demand it.

## First principles

1. **Wire spec is the contract.** HL7v2 Transport §2.3.1: framing is `<VT>content<FS><CR>` (`0x0B`, `0x1C`, `0x0D`). MLLP is synchronous — one message in flight per connection. No silent replay on drop. These are the only invariants the library imposes; everything else is policy the caller can override.

2. **The wire layer is pure.** Framing is byte-level: `encode(bytes) → frame`, `decode(frame) → bytes`. Stream wrappers come later, separately. No class.

3. **The ACK layer is pure.** ACK parsing is `parse(frame) → Acknowledgment`. NAK-vs-accept is a predicate on the parsed value. Throwing is a caller decision.

4. **The client is one class, one socket, one in-flight send.** That's the smallest correct kernel. Queue, reconnect, pool — none ship in v0. They're additive in later phases, each justified by a concrete need.

5. **No abstractions without a second consumer.** `MllpDispatcher` interface defers until a pool implementation exists. Same for any "strategy" or "policy" interface — keep them as functions until a second caller wants the option.

6. **Errors named by domain, codes are mutually exclusive.** `CLIENT_CLOSED` ≠ `CONNECTION_CLOSED` ≠ `TIMEOUT` ≠ `MALFORMED_ACK`. A caller's `switch` on the code never needs context.

7. **`AbortSignal` hygiene is structural.** Every `addEventListener` has a paired `removeEventListener` via a disposer. We use `AbortController` + `setTimeout` + `clearTimeout` directly so the per-send timer is cancellable; no `AbortSignal.timeout` for our internal deadlines.

8. **Tests before public surface.** Each phase opens a PR-sized chunk where the test file lands first, the implementation makes it pass, and CI is green before merge. Headline features ship with at-least-one direct test.

9. **Documentation contracts over runtime defence.** Connectors MUST honour `signal`; we test our own runtime adapters honour it. We don't defensively race the cycle against a wall-clock timeout for misbehaving connectors — we test instead.

10. **Public API matches mainstream patterns.** Names look like `undici` / `ioredis` / `mqtt.js`. Method shapes (`Promise<T>` not `PromiseLike`, options bag not positional, `Symbol.asyncDispose`) follow Node 20+ idioms.

## Scope

In scope for this rebuild:

- `@glion/mllp-transport` — pure byte-level framing codec
- `@glion/ack` — HL7v2 ACK types + parse + accept/NAK predicate (`throwOnNak` stays a separate helper, not embedded in transport)
- `@glion/mllp-client` — persistent client, single socket, queued sends, opt-in reconnect

Out of scope for this rebuild — to migrate after the new client lands:

- `@glion/mllp` (server) — currently consumes `@glion/mllp-transport`, will adopt the new shape
- `@glion/mllp-ack` (server-side ACK middleware) — currently consumes `@glion/ack`, will adopt the new shape
- `@glion/glion` (CLI) — consumes both; migrates last

The build stays red on the server packages between phase 1 and phase 6. That's the price of starting from zero. If the user wants a non-red intermediate state, the alternative is to keep `mllp-transport` and `ack` as-is and only rebuild `mllp-client` — but that locks in the existing codec / ACK API shape.

## Public API sketch (locked after adversarial review)

```ts
// @glion/mllp-transport — pure functions + one Web Streams class
export const VT = 0x0b;
export const FS = 0x1c;
export const CR = 0x0d;
export function validate(payload: Uint8Array | string): void;
export function frame(payload: Uint8Array | string): Uint8Array;
export function decode(input: Uint8Array): Uint8Array;
export function createFrameDecoder(opts?: FrameDecoderOptions): FrameDecoder;
export class FrameDecoderStream extends TransformStream<Uint8Array, Uint8Array> { … }
export class FramingError extends Error { readonly code: FramingErrorCode }

// @glion/ack — types + parser + predicates
export interface Acknowledgment { code, controlId, textMessage?, errorCode?, severity?, raw, tree }
export function parse(raw: string | Uint8Array): Acknowledgment;
export function isAccept(ack: Acknowledgment): boolean;
export function throwOnNak(ack: Acknowledgment): asserts ack is AcceptAck;

// @glion/mllp-client — one class, runtime-adapter-supplied connector
export class MllpClient {
  constructor(opts: MllpClientOptions);
  readonly host: string;
  readonly port: number;
  readonly state: 'idle' | 'connecting' | 'ready' | 'closing' | 'closed';
  connect(opts?: { signal?: AbortSignal }): Promise<void>;
  send(message: SendInput, opts?: { signal?: AbortSignal }): Promise<Acknowledgment>;
  close(opts?: { force?: boolean }): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

interface MllpClientOptions {
  host: string;
  port: number;
  connect: MllpConnect;                    // runtime adapter supplies
  tls?: boolean | MllpClientTlsOptions;    // default true
  timeout?: number;                        // per-send deadline, default 30_000
  // Reconnect: deferred to phase 6. v0 has none. Drop → closed.
}
```

What v0 deliberately doesn't have:

- Reconnect (phase 6)
- Internal send queue (phase 5 — until then, concurrent sends throw `CONCURRENT_SEND`)
- `MllpDispatcher` interface (deferred — re-introduce when `MllpPool` lands)
- Lifecycle callbacks (`onConnect`/`onEnd`/etc.) — defer until a real caller wants them
- `queueDepth` getter (lands with the queue in phase 5)

## Phased delivery

Every phase is one commit (or one small series). Tests land in the same commit as the code they cover. CI is green per phase except across phases 1–6 where the server packages are red (documented).

| #   | Phase                                          | Definition of done                                                                                                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Reset + plan                                   | This document committed; branch reset to `origin/main`; the three target packages deleted. CI is red on dependent packages — expected.                                                                                                                                                                                                  |
| 1   | `@glion/mllp-transport` v0                     | Pure functions: `encode`, `decodeOne`, `decodeStream` (sync generator). 100 % branch coverage on the codec. No streams API yet. Bench harness reused from the archive.                                                                                                                                                                  |
| 2   | `@glion/mllp-transport` Web Streams wrapper    | `createDecoderStream` as a TransformStream that wraps `decodeStream`. Tests with mocked input.                                                                                                                                                                                                                                          |
| 3   | `@glion/mllp-client` v0                        | Single class, single socket, single in-flight. `connect`, `send`, `close`, `Symbol.asyncDispose`. `send` returns `MllpClientResponse`; NAK throws `MllpRejectedError`. Drop → `closed`. Concurrent `send` → `CONCURRENT_SEND`. Runtime adapter for Node. Tests against a fake duplex.                                                   |
| 4   | `@glion/mllp-client` v0.1 — queue              | Concurrent sends queue. `queueDepth` getter. `CONCURRENT_SEND` removed. Per-send `timeout` includes queue wait. Tests assert order, queue-depth accounting, and abort-while-queued.                                                                                                                                                     |
| 5   | `@glion/mllp-client` v0.2 — opt-in reconnect   | `reconnect?: { initialDelayMs?, maxDelayMs?, factor?, jitter?, maxAttempts? }`. Default: undefined = no reconnect. Reconnect is **opt-in**, not default-on. New `'reconnecting'` state. Tests cover: drop → reconnect → ready, drop with no reconnect option → `closed`, max-attempts → `closed`, close-during-reconnect cancels timer. |
| 6   | Workers runtime adapter                        | `@glion/mllp-client/workers` — port the existing adapter shape (no `nodejs_compat` requirement).                                                                                                                                                                                                                                        |
| 7   | Migrate `@glion/mllp` server                   | Adopt the new transport API. Server-side ACK builder (`acknowledge(request, opts) → Root`) lands inside `@glion/mllp-ack` as a middleware-internal helper. CI green on server again.                                                                                                                                                    |
| 8   | Migrate `@glion/mllp-ack` + `@glion/glion` CLI | Adopt the new transport / response APIs. CLI's `parseAckCode` regex deleted in favour of `parseHL7v2` + `value(tree, "MSA-1[1].1.1")`. CI green everywhere.                                                                                                                                                                             |
| 9   | Changeset + release notes                      | Major-version bump on the two remaining target packages. Migration notes for downstream consumers (incl. "if you imported from `@glion/ack`, the parser half is inlined into `@glion/mllp-client`; the builder half is now inside `@glion/mllp-ack`").                                                                                  |

Branch state across phases: red builds on `@glion/mllp` and `@glion/glion` from phase 0 until phase 8/9. The branch keeps moving forward — we don't try to keep every intermediate commit shippable; we keep every phase reviewable and self-contained.

## Locked decisions (revised after the four-reviewer adversarial sweep)

- **Send path is `frame(payload)`, not three writes.** Earlier Phase 1 drafted `FRAME_START` / `FRAME_END` shared buffers + manual three-write streaming. The adversarial review found two reasons to reverse: (1) the shared mutable buffers are a P0 process-wide footgun — anyone can mutate them, no language-level defence exists for typed arrays; (2) the "three writes saves a copy" rationale was unmeasured and likely wrong on real Node sockets, where per-write WriteWrap + libuv-tick overhead exceeds the cost of a single 1–10 KB allocation. `frame()` ships one allocation per send and one socket write. The decision is sized for typical HL7v2 payloads (200 B – 10 KB); we'll revisit if a multi-MB attachment use case lands.
- **Streaming decoder is a closure factory, not a class.** `createFrameDecoder()` returns a plain object — matches CLAUDE.md §4 ("functional over class for internal types") and avoids the `#private` field syntax. `FrameDecoderStream` is a class only because it has to extend `TransformStream`.
- **`push()` does not throw.** Returns `FramingError | null` and delivers frames via callback. Frames already extracted in the same chunk are not lost when a later byte fails — they're emitted before the error returns.
- **Growth-doubling buffer + `maxBufferedBytes` (default 16 MiB).** Closes the slow-loris O(n²) concat and the unbounded-frame OOM that three reviewers independently flagged.
- **Decode and streaming decode share one `findFsCr` helper.** They now agree on every wire input. Lenient on embedded FS-not-followed-by-CR (matches Mirth / HAPI / Iguana).
- **`FrameDecoderStream` errors `MISSING_END_BLOCK` on close with buffered bytes.** No silent data loss.
- **`@glion/ack` is dropped.** The original Phase 3 ack package gets deleted from the plan entirely. ACKs are HL7v2 messages; the codebase already has `@glion/parser` to parse them and `@glion/util-query` to read fields. Shipping a separate package would either copy the AST into a parallel struct (drift risk, breaks composability with unified) or ship a wrapper around `value(tree, …)` calls that adds no real value. The few ACK concerns live where they're needed: the **client** inlines `AckCode` constants and the throw-on-NAK behaviour; the **server** (Phase 7+) gets the ACK _builder_ inside `@glion/mllp-ack` as middleware-internal helpers.
- **`MllpClient.send()` throws `MllpRejectedError` on NAK by default — no opt-out flag.** Matches AWS / Mongo / Stripe convention. Callers who want to inspect a NAK without try/catch can already do so by catching and reading the error's fields. A second `sendNoThrow()` method is not on the roadmap; add when a concrete consumer asks.
- **`MllpClientResponse` is a six-field struct, not a bare `Root`.** Fields: `code: AcceptCode` / `controlId: string` / `tree: Root` / `raw: Uint8Array` / `timestamp: Date` / `durationMs: number`. `MllpRejectedError` carries the same fields with `code: NakCode`. Each field has a one-sentence defence: `code` is the status, `controlId` is the correlation primitive (universal SDK convention — AWS `$metadata.requestId`, Stripe `id`, Mongo `_id`), `tree` is the parsed AST for arbitrary field access, `raw` is for byte-level audit / observability pipelines, `timestamp` is the wall-clock anchor for logs, `durationMs` is the wire-level RTT measured monotonically (more accurate than a caller's `performance.now()` wrap). No `textMessage`, `errorCode`, `severity` shortcuts — those go through `value(tree, …)`. `durationMs` uses `performance.now()` deltas, not `receivedAt - sentAt`, so it survives NTP adjustments and suspend/resume.
- **`controlId` verification is part of `send()`.** When the response's MSA-2 is non-empty and differs from the request's MSH-10, `send` throws `MllpCorrelationError`. When the response's MSA-2 is empty (some early-version peers don't echo it), we accept — real-world compat. This catches out-of-band ACKs from previously-timed-out requests, which is a real failure mode of single-flight clients.

## Decisions deferred to "when we need it"

- **Reconnect default-on vs opt-in.** v0 / v0.1 / v0.2 ship opt-in. Decide default after at least one production-shaped consumer reports operational pain that default-on would prevent. Recent evidence: default-on caused 8 test rewrites and a hung-test loop. Opt-in keeps the kernel smaller.
- **EventEmitter vs callbacks vs typed observer.** v0 has no lifecycle observation at all. Add when a concrete user wires logging or metrics. Default to a typed observer (`client.on('connect', cb): Disposer`) at that point — avoids both the `node:events` dependency and the callback-in-options-bag clutter.
- **`MllpDispatcher` interface.** Introduce when `MllpPool` lands. Not before.
- **`AckCode` widening to `(string & {})`.** Inside `@glion/mllp-client`, the union widens to `AckCode | (string & {})` for auto-complete plus vendor-code passthrough. Real win, costs nothing.

## Risk acknowledgements

- **The branch is in a deliberately broken state from phase 0 until phase 7.** Anyone pulling the branch mid-rebuild will see server/CLI compile errors. The safety tag `archive/persistent-connection-mvp-pre-rebuild` is the bail-out: `git reset --hard archive/persistent-connection-mvp-pre-rebuild` restores the pre-rebuild state.
- **Test parity isn't free.** The archive has ~85 client tests. The new client's test set won't 1:1 map — many old tests are about behaviours we're explicitly dropping (lazy-reopen-after-drop, signal-forwarding-to-connector). New tests target the new contracts.
- **Server consumers may want changes to the new transport API.** Phases 7–8 may surface "the old shape was actually useful here" feedback. Budget for one round of transport-API adjustment after the migration.
- **No public release until phase 9.** The npm-published `@glion/mllp-client` is unchanged for users until phase 9 lands (assuming we don't `pnpm ci:publish` from a half-finished branch).
