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

## Public API sketch (the target)

```ts
// @glion/mllp-transport — pure functions, no classes, no streams
export const MLLP = { VT: 0x0b, FS: 0x1c, CR: 0x0d } as const;
export function encode(payload: Uint8Array | string): Uint8Array;
export function decodeOne(frame: Uint8Array): Uint8Array;        // single complete frame in/out
export function* decodeStream(chunks: Iterable<Uint8Array>): Generator<Uint8Array>;
// Web Streams wrappers ship as a sibling export, not the default.
export function createDecoderStream(opts?): TransformStream<Uint8Array, Uint8Array>;

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
| 3   | `@glion/ack` v0                                | Types + `parse` + `isAccept` + `throwOnNak`. Tests covering AA / AE / AR / CA / CE / CR + malformed + vendor codes. No HL7v2 error-code semantics beyond what's needed for `throwOnNak`.                                                                                                                                                |
| 4   | `@glion/mllp-client` v0                        | Single class, single socket, single in-flight. `connect`, `send`, `close`, `Symbol.asyncDispose`. Drop → `closed`. Concurrent `send` → `CONCURRENT_SEND`. Runtime adapter for Node. Tests against a fake duplex.                                                                                                                        |
| 5   | `@glion/mllp-client` v0.1 — queue              | Concurrent sends queue. `queueDepth` getter. `CONCURRENT_SEND` removed. Per-send `timeout` includes queue wait. Tests assert order, queue-depth accounting, and abort-while-queued.                                                                                                                                                     |
| 6   | `@glion/mllp-client` v0.2 — opt-in reconnect   | `reconnect?: { initialDelayMs?, maxDelayMs?, factor?, jitter?, maxAttempts? }`. Default: undefined = no reconnect. Reconnect is **opt-in**, not default-on. New `'reconnecting'` state. Tests cover: drop → reconnect → ready, drop with no reconnect option → `closed`, max-attempts → `closed`, close-during-reconnect cancels timer. |
| 7   | Workers runtime adapter                        | `@glion/mllp-client/workers` — port the existing adapter shape (no `nodejs_compat` requirement).                                                                                                                                                                                                                                        |
| 8   | Migrate `@glion/mllp` server                   | Adopt the new transport API. CI green on server again.                                                                                                                                                                                                                                                                                  |
| 9   | Migrate `@glion/mllp-ack` + `@glion/glion` CLI | Adopt the new ack API. CI green everywhere.                                                                                                                                                                                                                                                                                             |
| 10  | Changeset + release notes                      | Major-version bump on all three packages. Migration notes for downstream consumers.                                                                                                                                                                                                                                                     |

Branch state across phases: red builds on `@glion/mllp` and `@glion/glion` from phase 0 until phase 8/9. The branch keeps moving forward — we don't try to keep every intermediate commit shippable; we keep every phase reviewable and self-contained.

## Decisions deferred to "when we need it"

- **Reconnect default-on vs opt-in.** v0 / v0.1 / v0.2 ship opt-in. Decide default after at least one production-shaped consumer reports operational pain that default-on would prevent. Recent evidence: default-on caused 8 test rewrites and a hung-test loop. Opt-in keeps the kernel smaller.
- **EventEmitter vs callbacks vs typed observer.** v0 has no lifecycle observation at all. Add when a concrete user wires logging or metrics. Default to a typed observer (`client.on('connect', cb): Disposer`) at that point — avoids both the `node:events` dependency and the callback-in-options-bag clutter.
- **`MllpDispatcher` interface.** Introduce when `MllpPool` lands. Not before.
- **`Acknowledgment.code` widening to `(string & {})`.** Keep the current widening (auto-complete for AA/AE/etc., accept vendor codes) — it's a real win and costs nothing.

## Risk acknowledgements

- **The branch is in a deliberately broken state from phase 0 until phase 8.** Anyone pulling the branch mid-rebuild will see server/CLI compile errors. The safety tag `archive/persistent-connection-mvp-pre-rebuild` is the bail-out: `git reset --hard archive/persistent-connection-mvp-pre-rebuild` restores the pre-rebuild state.
- **Test parity isn't free.** The archive has ~85 client tests. The new client's test set won't 1:1 map — many old tests are about behaviours we're explicitly dropping (lazy-reopen-after-drop, signal-forwarding-to-connector). New tests target the new contracts.
- **Server consumers may want changes to the new transport API.** Phases 8–9 may surface "the old shape was actually useful here" feedback. Budget for one round of transport-API adjustment after the migration.
- **No public release until phase 10.** The npm-published `@glion/mllp-client` is unchanged for users until phase 10 lands (assuming we don't `pnpm ci:publish` from a half-finished branch).
