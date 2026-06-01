# MllpClient redesign — durable, lazy-connecting, observable

> **Status:** design doc (scratch, not an ADR yet).
> **Build approach (decided):** refactor the whole package to the future-ready module structure (§6) incrementally, reconnect **off by default** throughout; the existing tests stay green at every step; the durable loop is wired last behind an opt-in. Offline queue: **hold by default** (§7.2).
> **Provenance:** multi-agent design study (3 analyses + 4 designs + 9 adversarial verdicts). Where the verdicts corrected the design agents, this doc follows the verdict.

---

## 1. Goal

Evolve `MllpClient` from a **single-use** client (one connection per instance; reconstruct after a drop) into a **durable** one (a long-lived instance that survives drops by reconnecting), with **lazy connect** (auto-connect on first `send()`) and **lifecycle observability** (an event surface, not just a polled getter) — without breaking `send()` ergonomics or the real-`Promise` contract.

### Locked (not reopened — backed by the prior 24-agent review + the serial server)

- **Single-flight is final.** One message on the wire at a time, FIFO queue.
- **No message-send retry.** Resending a written-but-unACKed message risks duplicate clinical records (ADT/ORM/ORU). At-most-once is the law. _Connection_ reconnect is safe; _message_ retry is not.

### Reopened this round — and re-decided

- **Effect / native wire** were reopened because durable+observable+reconnect is the most Effect-shaped this client will ever be. **Re-examined and still rejected** (§2).

---

## 2. Tooling verdict: stay native + XState (no Effect)

Three configs were ranked: **A** = XState lifecycle + native wire + native `EventEmitter`; **B** = Effect-native everything (Schedule replaces XState); **C** = XState + an Effect island for wire/events.

**Recommendation: Config A.** B rejected, C distant-second-not-recommended. All three analyses and the adversarial pass converged.

Why Effect still loses _even under the new framing_:

- **Schedule** (its strongest card) wraps a _retryable operation_. There is no retry loop around `send()` (message-retry is out). The only retry is connection backoff — already in `reconnect.ts` (`backoffDelay`) **and** the XState `after` timer.
- **Scope** (resource teardown) is already given by the `MllpDuplex` contract: `close()` MUST resolve + be idempotent; we already `await duplex.close()` in `finally`.
- **Queue** is dead weight under single-flight — the FIFO is an array + a `draining` boolean + a `while(shift)` loop; there is exactly one consumer.
- **Stream/PubSub** for the event surface is what `actor.subscribe` → a Node `EventEmitter` already gives, in the shape HL7 integrators expect.
- **Cost is asymmetric:** `xstate@5.32` is _already_ a dep (~15 KB gzip, zero transitive deps). `effect` ships `fast-check` + `@standard-schema/spec` as **runtime** deps (a property-testing lib in a healthcare client's production tree) and forces `runPromise` at the `send()` boundary — the exact thenable bridge §6 forbids. B also rips out a just-shipped, green machine; C ships _two_ runtimes for one island whose boundary still bridges Promises, so it can't compound.

> Revisit Effect only if the client ever gains genuinely concurrent operations (multiplexing, windowed/pipelined sends, a pool) — all of which contradict the locked single-flight decision.

---

## 2b. Send currency — bytes-verbatim primary, AST a first-class convenience

Re-evaluated directly (a study, prompted by the review note "the first-class citizen should be the AST, not String/Uint8Array"). **Verdict: keep `SendInput = string | Uint8Array | Root` with bytes-verbatim as the load-bearing contract; the AST is a genuine first-class _convenience_ input, not the sole currency.**

The note's instinct is right for the rest of glion (transform/lint/validate/build are all AST-native) but wrong at the **wire boundary**, which is exactly where the AST's abstractness becomes a _fidelity_ liability. `parse → toHl7v2` is provably **not** byte-identical in this repo: CRLF→CR collapse at parse (`preprocessor.ts`), trailing-empty-field drop (`PID|foo|` → `PID|foo`), trailing empty unnamed segments popped, delimiters re-derived from the tree, decoded escapes (`\F\`/`\X..\`) not re-encoded, and a strict-UTF-8 reader that would reject a Latin-1 feed the byte path forwards fine. The dominant MLLP use case is a **relay / interface engine** (Mirth/Rhapsody/Iguana) that holds original bytes and must forward them unchanged — AST-only would force a lossy round-trip on every relayed message. It is also already inconsistent with the internal design: the queue carries `PendingSend.framed: Uint8Array`, so "AST-only inside the client" would mean re-introducing a parse+serialize per dispatch.

So `send()` correctly uses the tree as the _reading_ surface (MSH-10 correlation, parsed ACK) and the caller's bytes as the _wire_ surface; only a `Root` (which has no source bytes) is serialized. No code change — the contract, the README/JSDoc, and a byte-verbatim regression test (`client.test.ts` "sends string input on the wire verbatim — a trailing empty field survives") were all already in place. A `sendRaw()`/`send()` split was rejected (§1/§5). The note is resolved as _by design_.

## 2a. Queue location — stays native (machine does NOT own the send queue)

Re-evaluated directly (a follow-up study, prompted by "should the machine also operate queuing/sending?"). **Verdict: keep the queue, drain loop, and per-send coordination native in the manager; the machine stays connection-lifecycle only.** Four shapes were weighed — Q1 (machine gains `connected.idle↔sending` substates for observability only), Q2 (FIFO as ids in machine context + native side-table for payload), Q3 (per-send spawned child actors), Q4 (status quo). **Q4 chosen.**

Why the queue can't cleanly move in:

- **Every per-send value is non-serializable** — `resolve`/`reject` (the caller's Promise settlers), the framed `Uint8Array`, the `AbortSignal`s, the deadline timer handle, the abort listener. None can live in serializable machine context. So Q2/Q3 can relocate the _control topology_ (FIFO order, single-flight gate, disposition) into the chart but the _payload_ stays native regardless — a hybrid with a new id-correlation or spawned-actor bridge, not a clean win.
- **Real-Promise (§6) is cheapest native.** `send()` is `new Promise((resolve,reject) => …)` settled directly by the drain loop — no `toPromise`/bridge, no resolver smuggled through events. Q2/Q3 add a bridge the status quo simply doesn't need.
- **Single-flight makes it not worth it (§1).** With exactly one message on the wire ever, the queue is a tiny array + one drain loop; a statechart adds ceremony (id-correlation, redundant `SETTLED` echo events, split-brain between context-ids and the value-map) without removing a bug class. Q2 makes `DELIVERY_UNKNOWN` _more_ fragile by spreading the in-flight-drop settle across machine+manager+connection instead of one synchronous reset.
- **Durable coordination doesn't require it.** Hold-across-reconnect / resume-on-reconnect / pause-drain are small local edits to the native drain (gate on `connected`, re-kick `drain()` on the `connected` entry, don't `failQueue` on a transient drop). Hold is actually _easier_ as plain array entries than as machine-referenced actors.

**The one piece worth revisiting later (Q1-lite, deferred to events.ts):** promote _only_ the single-flight gate to `connected.idle ⇄ connected.sending` substates so "is a send on the wire" becomes an inspectable machine signal feeding `events.ts` — **without** moving the queue array, resolvers, or bytes in. Decide this when building `events.ts`, since that's the only consumer that would justify it. (Note: the prior `#onWire` flag is already gone — `client.state` now reports the machine phase, so there is no live "sending" public state demanding this today.)

## 3. The machine's role — lifecycle authority, **not** full orchestrator

The design study's first instinct ("machine as orchestrator via two invoked actors: dial + delay") was **walked back by the adversarial pass**, correctly:

- The **delay actor is redundant** — the machine already does backoff declaratively via `after: { reconnectDelay: "reconnecting" }`, which cancels for free on `CLOSE`. Replacing it with an invoked actor is ceremony (§1).
- "**Dial as an invoked actor**" **contradicts "all wire I/O stays native"** and risks pulling socket I/O into the machine's ownership.
- "**Thin bridge calls all wire I/O on enter/exit**" is **wrong for the send exchange**: entry/exit actions are fire-and-forget, but `send()` must return a real `Promise<MllpClientResponse>` (§6). The machine's own JSDoc already says the exchange can't live in the machine "without smuggling resolve/reject through events."

**So: keep the machine lifecycle-focused and pure (no I/O).** The client owns dial, redial, the read loop, and the wire exchange natively. The machine is the **transition authority + backoff timer**; the client drives I/O on the machine's transition edges and reports outcomes back as events (`CONNECTED` / `CONNECT_FAILED` / `RECONNECT_FAILED` / `DROP` / `CLOSE`). This is a modest, honest promotion of what the machine already does — not a rewrite into an actor-orchestrator.

### Machine changes for durability

- Reserve `closed` (`type: "final"`) **strictly** for explicit `CLOSE` or exhausted attempts.
- A `DROP` with reconnect budget → `backingOff` → (`after`) → `reconnecting` → `connected`; with **zero budget (`NO_RECONNECT`) → `closed`** (today's exact behavior, byte-for-byte).
- `connected.entry` resets the attempt counter (already there).

---

## 4. The two new safety hazards the durable shift introduces

These are the heart of the redesign. They are **type/semantics problems, not runtime problems** — Effect makes neither safer.

### 4.1 Cross-connection late-ACK contamination (confirmed, high severity)

The persistent `FrameDecoder` buffer, `#pendingFrames`, `#frameWaiter`, and `#pendingError` are **connection-scoped** but currently live as **instance** fields, reset only as an incidental side-effect of the `closed`-path teardown. In a durable client they must be **destroyed and recreated at every connection boundary**, or a stale ACK from connection _N_ gets positionally matched to a send on connection _N+1_.

- The decoder buffer holds raw bytes from _N_'s dead socket; carried forward, they prepend to _N+1_'s first ACK and corrupt framing. (The codebase already treats a non-empty decoder buffer as a corruption risk — the slowloris path calls `decoder.reset()`.)
- `#pendingFrames`/`#frameWaiter` are matched **positionally** (next-frame FIFO), with no per-send identity check before `parseResponse`.
- **MSH-10/MSA-2 correlation is NOT a reliable backstop** — `parseResponse` silently _skips_ correlation when either ID is empty (real-world peers with empty MSA-2, or raw/unparseable sends). It catches the within-connection case it was built for; it cannot be relied on across connections.

**Fix (structural, not defensive):** make a per-connection object the unit of lifetime (§6). A new connection ⇒ a fresh object ⇒ a fresh decoder; _N_'s bytes physically cannot reach _N+1_. The `#pendingError` single-use dependency (the code's own `NOTE:` comment) dissolves — it dies with the connection object.

### 4.2 In-flight-at-drop delivery ambiguity → `DELIVERY_UNKNOWN`

A send that reached `writer.write()` but whose ACK never arrived before the drop has **genuinely ambiguous** delivery.

- **The load-bearing safety rule is "never auto-resend it."** (Verified: distinctness alone isn't what preserves at-most-once — _not resending_ is.)
- **But a distinct typed code is still strongly recommended for caller correctness.** Today this rejects `DROPPED` and the machine goes `closed`, so the caller knows the client is dead. In a durable client the machine _silently reconnects_ — if the in-flight promise still said `DROPPED`, a caller could reasonably assume the durable client will "handle it." It must not. A distinct, non-retryable `DELIVERY_UNKNOWN` makes the at-most-once contract legible at the call site.

**The boundary is mechanically crisp** — `writer.write()` is the single dividing line:
| Situation | Code | Meaning |
|---|---|---|
| Reached `writer.write()`, drop before ACK | **`DELIVERY_UNKNOWN`** (new) | Ambiguous. Never auto-resend. Reconcile out of band. |
| Never reached the wire (queued at terminal close, or `send()` after close) | `CLOSED` | Safe — definitely not delivered. |
| Connection-level drop fact | `DROPPED{reason}` | Surfaced on the lifecycle `error`/`drop` **event**, not on a send promise. |

---

## 5. Public API (recognizable evolution)

```ts
interface MllpClientOptions {
  readonly host: string;
  readonly port: number;
  readonly connect: MllpConnector;
  readonly connectTimeoutMs?: number;   // default 30_000
  readonly sendTimeoutMs?: number;      // default 30_000
  readonly maxBufferedBytes?: number;   // default 16 MiB
  readonly reconnect?: ReconnectPolicy | false;  // NEW. default false (see §7)
  readonly enableOfflineQueue?: boolean;          // NEW. see §6 open question
}

class MllpClient {
  // lazy: send() from idle auto-connects; connect() optional/eager + idempotent/joinable
  connect(opts?: { signal?: AbortSignal }): Promise<void>;
  send(msg: SendInput, opts?: { signal?; timeoutMs? }): Promise<MllpClientResponse>; // real Promise (§6)
  close(): Promise<void>;               // idempotent
  [Symbol.asyncDispose](): Promise<void>;

  // observability — .on() ergonomics (ioredis/pg convention) over a tiny
  // runtime-agnostic emitter (NOT node:events — see §5 note)
  on(event: MllpClientEvent, cb): this; off(...): this; once(...): this;

  get state(): MllpClientState;         // union extended: reconnecting / backingOff distinct
  get connected(): boolean;
  get queueDepth(): number;
  get host(): string; get port(): number;
}
```

- **Lazy connect** — `send()` from `idle` initiates a connect and enqueues; `connect()` stays for eager warm-up and becomes **idempotent + joinable** (calling it while connecting/connected resolves on next `connected`, no longer throws `ALREADY_CONNECTED`). **Caveat (verdict):** auto-connect must _idempotently join a single_ dial across racing first sends, and `send()`'s reject union widens with `CONNECT_FAILED`/`CONNECT_TIMEOUT`/`CONNECT_ABORTED` — must be documented.
- **Events** — `.on()` ergonomics with events `connecting`, `connect`(ed), `reconnecting`(attempt, delayMs), `drop`(reason), `close`, `error`, over a **tiny hand-rolled runtime-agnostic typed emitter — NOT Node's `EventEmitter`**. The client ships Node/Deno/Workers adapters, and `node:events` is unavailable on Cloudflare Workers / edge / Deno-without-node-compat; importing it would break the runtime-agnostic premise of the `MllpConnector`/`MllpDuplex` abstraction. The emitter is ~40 lines (`Map<event, Set<cb>>` + `on`/`off`/`once`/`emit`), zero imports, fully typed — and is more on-philosophy than `node:events` (zero-dep, functional). (`EventTarget` is the web-standard alternative but its `CustomEvent.detail` payloads and `Event` subclassing are clunkier for typed events.) Derived internally from `actor.subscribe`; **XState never leaked**. User-listener errors isolated at the emit boundary, re-thrown via `queueMicrotask` (loud, not swallowed; no `console.*`).
- **Errors** — `MllpClientError` discriminated by `MllpErrorCode`; `AckException` family for NAKs — unchanged. **Add one code: `DELIVERY_UNKNOWN`** (§4.2).

---

## 6. Module structure

Driven by **lifetime boundaries** (instance-scoped vs connection-scoped), not line count. Honest framing: most files already exist and are _kept_; the genuinely new extractions are **`connection.ts`** and **`manager.ts`** (and a small **`events.ts`**).

| File                | Status                             | Responsibility                                                                                                                                                                                                                           | Lifetime           |
| ------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `errors.ts`         | keep + extend                      | `MllpClientError`, codes (+`DELIVERY_UNKNOWN`)                                                                                                                                                                                           | —                  |
| `reconnect.ts`      | keep                               | `ReconnectPolicy`, `backoffDelay()`                                                                                                                                                                                                      | —                  |
| `state.ts`          | keep + evolve                      | pure XState machine + phase types; durable loop                                                                                                                                                                                          | —                  |
| `hl7v2.ts`          | keep                               | encode + `parseResponse` (correlation/codec)                                                                                                                                                                                             | —                  |
| **`connection.ts`** | **new**                            | `createConnection()` — one socket's mortal state: fresh decoder, reader/writer, `pendingFrames`, `pendingError`, `frameWaiter`, read loop, drop watch, single-flight exchange. On drop, rejects its in-flight waiter `DELIVERY_UNKNOWN`. | **per-connection** |
| **`manager.ts`**    | **new**                            | `createConnectionManager()` — owns the actor, FIFO queue + drain, dial/redial (epoch-tagged), lazy-connect, queue disposition, machine→events bridge. Creates/replaces `Connection`s.                                                    | **instance**       |
| **`events.ts`**     | **new (small)**                    | typed `on/off/once` over `EventEmitter`; maps actor transitions → events                                                                                                                                                                 | instance           |
| `client.ts`         | shrinks to facade (~120–180 lines) | public `class MllpClient`; delegates to manager; `send()` returns a real Promise by direct `return manager.send(...)`                                                                                                                    | —                  |

Deliberately **not** split (§1): no `queue.ts` (it's ~50 lines, meaningless without the manager's phase), no `correlation.ts`/`codec.ts` (that's `parseResponse`, already in `hl7v2.ts`), no `dial.ts` (shares the manager's epoch + machine). **Correction to the study:** it said "no sub-folders," but `runtime/` (the Node adapter folder) already exists and stays.

### The epoch primitive

A monotonic connection generation. Every per-connection async task (`runReadLoop`, `watchForDrop`, the dial) captures `epoch` at spawn and no-ops if it no longer matches. Generalizes the existing ad-hoc `this.#duplex === duplex` checks into one field; fixes superseded-task races, the instance-wide `#closingExplicit` bug, and double-drop processing. One field, not a new abstraction.

### Atomicity caveat (high-severity verdict)

Moving teardown onto transition edges does **not** preserve today's single-method atomicity for free. The connection-scoped reset (settle the one in-flight waiter as `DELIVERY_UNKNOWN`, clear decoder/`pendingFrames`/`frameWaiter`/`pendingError`) **must run synchronously in the same tick as the `DROP`**, before any rebind — not deferred into an async `subscribe` callback. Single-flight bounds this to exactly one waiter/decoder/reader, which makes the synchronous reset tractable. This needs a dedicated client-layer test.

---

## 7. Decisions that need your call

1. **Reconnect default.** Study recommended flipping the constructor default to reconnect-**on** (mainstream durable convention). The adversarial pass flagged this as a **silent behavior + safety change** for existing callers (drop no longer terminal; in-flight failure mode changes). **Aligned with your "reconnect off" build choice: default stays `reconnect: false` (today's exact `NO_RECONNECT`); durability is opt-in.** Revisit the default flip as a separate, deliberate step once the durable path is proven. _(I'll proceed on off-by-default unless you say otherwise.)_

2. **Queued-but-unsent on drop: hold vs fail-fast.** **DECIDED: hold by default** (offline-queue convention — ioredis/mqtt.js). Queued-but-unwritten sends survive a transient drop and flush in FIFO order on the new connection; they are duplication-safe because they never touched the wire. Must ship with a bound (`maxBufferedBytes` already exists; consider a queue-length cap) and an `enableOfflineQueue: false` opt-out for callers who want fail-fast (`CLOSED`-on-drop). Note the HL7 ordering caveat: a held A08 could reach the peer before a possibly-lost A01 — documented, caller's responsibility.

3. **`DROPPED` reason cleanup.** Promote the in-flight-write case out of `DROPPED{peer-drop}` into `DELIVERY_UNKNOWN`; keep `DROPPED` for connection-level facts on the event surface. (No caller currently branches on this in tests.)

---

## 8. Incremental build sequence (reconnect off throughout)

1. **Extract `connection.ts`** — pure regrouping of the per-connection wire state into a factory; behavior identical; suite green. _(This alone fixes the lifetime-tangling and makes per-connection reset structural.)_
2. **Add the epoch** — replace `#duplex === duplex` checks; make `#closingExplicit` per-connection. Green.
3. **Add `DELIVERY_UNKNOWN`** — split the in-flight-write drop out of `DROPPED`; add the test. (Behavior change is limited to the error code on that one path.)
4. **Extract `manager.ts` + `events.ts`** — move queue/drain/dial + the `EventEmitter` bridge; `client.ts` becomes the facade.
5. **Lazy connect** — `send()` from idle auto-connects (idempotent join); document the widened error union.
6. **Durable loop (still default-off)** — wire `backingOff`/`reconnecting` to redial; per-connection reset on rebind; the atomicity test from §6. Ships behind `reconnect: <policy>`.
7. **(Later, separate)** decide the default flip and the offline-queue default.

Each step keeps the suite green; reconnect only activates when a caller passes a policy.
