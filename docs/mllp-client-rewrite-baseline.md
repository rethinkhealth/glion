# `@glion/mllp-client` — rewrite baseline

**Purpose.** This is the durable, framework-agnostic knowledge from the XState
attempt (PR #667), captured so the next implementation — **Effect** or **native
TypeScript** — starts from the lessons, not from scratch. PR #667 stays open as a
working, green, fully-reviewed reference; this doc is what you carry forward.

**How to read it.** §1 is what to reuse verbatim. §2–§4 are the contract +
regression checklist any implementation must satisfy (the load-bearing part).
§5 is the honest XState post-mortem (why we're moving on). §6 is the
Effect-vs-native comparison + a recommendation. §7 is the suggested first steps.

---

## 1. What carries over verbatim (don't rewrite these)

The XState attempt was a **control-plane** experiment. The **data plane** and the
codecs are framework-agnostic, already battle-tested, and should move to the new
branch unchanged:

- **`connection.ts`** — the per-connection wire: read loop, frame decoder,
  single in-flight ACK deferred (`PendingAck`), drop detection, the
  single-latched teardown. This _is_ the native data plane already; the new
  control layer wraps it (Effect) or calls it directly (native TS).
- **`errors.ts`** — `MllpClientError` + `MllpErrorCode` (the full taxonomy).
- **`backoff.ts`** — `RetryOptions`, `backoffDelay` (capped exponential + full
  jitter, immediate first retry), `NO_RETRY` / `DEFAULT_RETRY`.
- **`ack.ts`** — `parseResponse` (inbound codec + correlation) + `MllpClientResponse`.
- **`@glion/ack`** — `isAckNakCode`, the `AckException` family.
- **`runtime/node.ts`** — the Node `MllpConnector`/`MllpDuplex` adapter.
- **The entire test suite** — `connection.test.ts`, `client.test.ts`,
  `ack.test.ts`, `backoff.test.ts`, `node.test.ts`. These pin the behaviors in §3
  and are the regression net for the rewrite. Keep them; make the new
  implementation pass them.

What you're actually replacing is **`state.ts`** (the machine) and the parts of
**`client.ts`** that adapt it. Everything else is reuse.

---

## 2. Requirements & public contract

The surface and semantics that must survive any rewrite.

**Instance & lifecycle**

- One connection per instance, one-time lifecycle: `connect()` → connected →
  `close()`. The instance is spent after `close()` or a terminal failure — a new
  instance is required to reconnect.
- `close()` is idempotent, never rejects, and resolves once teardown has run.
- Implements `Symbol.asyncDispose` (`await using`).

**Message / wire semantics (cleaning client, AST is wire currency)**

- `send(string | Root)`. Every input is parsed to a tree and re-serialized to
  **canonical** HL7v2 — an _originating / cleaning_ client, not a byte-exact
  relay. Cleaning is syntactic only (CR line endings, trailing-empty trimming);
  escapes, Z-segments, repetitions, components round-trip verbatim.
- Raw bytes are **not** accepted — callers decode at their charset/MSH-18
  boundary and pass a `string`. The same parse reads MSH-10 for correlation.

**Single-flight**

- One send on the wire at a time; a concurrent `send()` rejects with
  `SEND_IN_PROGRESS`. (A FIFO queue is designed-for but deferred to a later
  version — the seam should allow it.)
- No caller `AbortSignal` on `send()`; a send is bounded by `timeoutMs` and by
  `close()` (which rejects the in-flight send).

**ACK / correlation**

- ACK decodes as strict UTF-8 (non-UTF-8 → `INVALID_RESPONSE`, charset error on
  `cause`). MSA-1 required; NAK (AE/AR/CE/CR) throws the matching `@glion/ack`
  `AckException`. MSA-2 ↔ request MSH-10 correlated **only when both are
  non-empty** (older peers omit MSA-2). Accept (AA/CA) resolves with
  `MllpClientResponse` (`code`, `controlId`, `tree`, `raw`, `timestamp`,
  `durationMs`).

**Timeouts**

- `connectTimeoutMs` (default 30 s) bounds a connect attempt. `sendTimeoutMs`
  (default 30 s, per-call `timeoutMs` overrides) is the ACK-wait deadline; the
  clock starts when the send reaches the wire, not at the `send()` call.

**Public API**

- `MllpClient`: `connect()`, `send(message, opts?)`, `close()`,
  `[Symbol.asyncDispose]`; getters `host`, `port`, `state`, `connected`.
- `MllpClientOptions` (`host`, `port`, `connect` required; `connectTimeoutMs`,
  `sendTimeoutMs`, `maxBufferedBytes` optional). `MllpSendOptions` (`timeoutMs`).
- Adapter contract — `MllpConnector`: `(opts:{host,port,signal}) =>
Promise<MllpDuplex>`; `MllpDuplex`: `readable`/`writable` Web Streams,
  `close()` (idempotent, never rejects), `closed` (resolves on either-side
  teardown, never rejects). **The connector owns the abort signal**, including
  closing a connection that opens just after an abort (no orphan leak).

---

## 3. Behaviors & edge-case regression checklist

The subtle things the current code handles. A rewrite that silently drops any of
these is a regression. (Each is pinned by a test in the suite.)

1. **Persistent read loop.** One read loop for the whole connection lifetime —
   never cancelled between sends. Cancelling between sends destroys the stream on
   real adapters. The decoder buffer survives **across sends within a
   connection** (enables coalesced + late frames) but **must not survive across
   connections** (a fresh connection object resets it by construction).
2. **Single-flight + the release ordering.** One send on the wire; a concurrent
   send → `SEND_IN_PROGRESS`. Subtle: the "exchange complete" signal must release
   single-flight **before** the caller's promise resolves, or `await send()`
   immediately followed by `send()` races into a false `SEND_IN_PROGRESS`.
3. **ACK correlation.** Correlate response MSA-2 to request MSH-10; mismatch →
   `INVALID_RESPONSE` naming both ids. Component-level match (`MSGID^suffix` ~
   `MSGID`). Honor custom MSH-1 field separators (don't `split("|")` blindly).
4. **Late-ACK buffering.** A frame arriving with no waiter (a late ACK for a
   timed-out send) is buffered; the next send drains it and the correlation check
   rejects the stale id as `INVALID_RESPONSE`. Buffer capped (16).
5. **Unsolicited-frame flood cap.** Past the buffer cap, the connection is closed
   `DROPPED` ("unsolicited frames") — bounds memory against a flooding peer.
6. **Send timeout stays connected.** No ACK in time → `SEND_TIMEOUT`; the wire
   stays usable for the next send (timeout is not fatal).
7. **Slowloris partial-frame reset.** On a send timeout _only_, if a partial
   frame sits in the decoder buffer, discard it so the next ACK isn't appended to
   stale bytes. Other failures leave the buffer alone.
8. **Peer-drop detection, single latch.** Two signals detect a drop (reader
   EOF/error and `duplex.closed`); a `dead` latch ensures teardown + the drop
   notification fire exactly once. The owner-initiated close path does **not**
   fire the drop notification.
9. **Write failure is terminal, two-part.** A failed write both tears the
   connection down (latch, close, notify) **and** rejects this send by throwing —
   the throw is required because the write failed before the ACK-wait registered,
   so the teardown has no parked waiter to reject.
10. **Close mid-send rejects in-flight.** `close()` while sending rejects the
    in-flight send with `CLOSED` and does not fire the drop notification.
11. **Connect abort / orphan-close race.** If the connection opens just after an
    abort, the orphan must be closed (the connector contract owns this). `close()`
    during connect → `CONNECT_ABORTED`.
12. **Retry/backoff.** Immediate first retry, then capped exponential with fresh
    full jitter per attempt; `attempt` resets on a successful connect; retries are
    per connection attempt, not global. Default is `NO_RETRY`.
13. **Three distinct connect errors.** Adapter rejects → `CONNECT_FAILED`;
    deadline → `CONNECT_TIMEOUT`; `close()` mid-connect → `CONNECT_ABORTED`.
14. **Drop → reconnect (when retry enabled).** A drop routes to backoff →
    reconnect transparently; the in-flight send rejects `DROPPED`, the next send
    after reconnect succeeds.
15. **Cleaning lives in the client, not the wire.** The wire writes the framed
    bytes verbatim; parse/clean/frame is the client layer's job.

---

## 4. Error model & legality table

**Two buckets, caught separately.** `MllpClientError` = "the wire/protocol failed
or the call was misused" (branch on `code`). `AckException` (from `@glion/ack`) =
"the peer understood and said no" (NAK).

`MllpErrorCode`: `CLOSED`, `ALREADY_CONNECTED`, `CONNECT_ABORTED`,
`CONNECT_FAILED`, `CONNECT_TIMEOUT`, `DROPPED`, `INVALID_RESPONSE`,
`NOT_CONNECTED`, `SEND_IN_PROGRESS`, `SEND_TIMEOUT`.

**Legality table** (operation × phase → outcome):

| Phase               | `connect()`         | `send()`           |
| ------------------- | ------------------- | ------------------ |
| idle                | → connecting        | `NOT_CONNECTED`    |
| connecting          | `ALREADY_CONNECTED` | `NOT_CONNECTED`    |
| connected (ready)   | `ALREADY_CONNECTED` | → on the wire      |
| connected (sending) | `ALREADY_CONNECTED` | `SEND_IN_PROGRESS` |
| backingOff          | `ALREADY_CONNECTED` | `NOT_CONNECTED`    |
| closed              | `CLOSED`            | `CLOSED`           |

Dynamic: connect attempt → `CONNECT_FAILED`/`CONNECT_TIMEOUT`/`CONNECT_ABORTED`;
on the wire → resolve / `AckException` / `SEND_TIMEOUT` / `DROPPED` /
`INVALID_RESPONSE`.

**Ownership principle:** one layer owns each error decision and nothing is parked
as recoverable state. Connection-level failures (`DROPPED`, framing) terminate the
in-flight send and the connection; per-send failures (`SEND_TIMEOUT`) reject only
that send and leave the wire up.

---

## 5. XState post-mortem

**Verdict: XState paid its way once, but for a connection lifecycle it's
overqualified — and bending its event model to do request/response cost more
elegance than the wins returned.**

**What it genuinely bought** (patterns worth keeping in any form):

- **Single-flight as a reachable state** (`connected.{ready,sending}`), not a
  boolean — illegal sends fall out of the table as a typed error.
- **Legality as a transition table** with a root default + per-state overrides —
  one home for "is this op legal here?"
- **Retry/backoff as states** (`connecting → backingOff → connecting`), intent
  spelled out.
- **A verified actor taxonomy:** one-shot async → `fromPromise`; long-lived
  two-way I/O → `fromCallback`; request/response over a shared reader → a
  **deferred**, _not_ an actor.

**The friction that ended it:**

1. **`emit` is not a request/response channel** (fire-and-forget, no
   correlation — verified). To return a value to a `send()` caller, the deferred
   had to be **smuggled on the event** (`SEND { …, settle }`). It works and is
   internal-only, but it's fighting tell-not-ask. This is the core reason XState
   was the wrong tool: the dominant operation (send→ACK) is _ask_, and XState
   has no _ask_.
2. **Callbacks-on-events** read backwards to every new reader ("why are
   resolve/reject on the event?"). The honest answer ("emit isn't RPC and the
   machine must own the error") is sound but un-idiomatic.
3. **Ceremony vs. a plain async function:** actor definitions + `setup()` + event/
   context/input types + compound states + `assign` + transition objects, to model
   what a single async function expresses directly.
4. **`fromCallback` footguns:** sync-only cleanup; `sendBack` after stop silently
   dropped; no return value (completion is an event); context frozen at invoke
   time (must pass changing values on events). All learnable, all friction.

**Verified `xstate@5.32.0` facts (don't relearn):** `emit` is deferred + has no
replay (a late subscriber misses it) and is not RPC; `fromCallback` cleanup is
synchronous and a post-stop `sendBack` is dropped; `invoke` input binds once at
entry; invoked children stop _after_ the current macrostep (state exit ≠ instant
socket teardown).

**Keep XState for** genuinely multi-state, transition-rich domains where errors
are _data_ (wizards, device drivers, workflows). **Avoid it for** request/response
over a shared channel (this client, a WebSocket/DB client) — there, a deferred
outside a small state holder is simpler.

---

## 6. Effect vs. native TypeScript

Both can express this cleanly. The question is whether Effect's machinery earns
its cost for _one long-lived socket with one in-flight request_.

### Effect

- **Primitives that fit:** `Deferred<A,E>` (the exact request/response bridge
  XState lacked), `Queue` (FIFO single-flight, ready for the future queue),
  `Scope` + `acquireRelease` (duplex teardown as a finalizer), `Schedule`
  (retry/backoff as a composable policy), `Fiber` + interruption (cancellation /
  deadlines that unwind finalizers), `Ref` (phase), `Stream` (inbound frames).
- **Pros:** the bridge is native (`Deferred`); cancellation, timeout, and retry
  _compose_ instead of being hand-plumbed; resource safety is structural
  (finalizers always run); typed error channel.
- **Cons for _this_ scope:** large API surface + learning curve (fibers, scopes,
  interruption) for a single socket; bundle size (~100 KB vs ~native) matters for
  a published healthcare _library_; its strength is structured concurrency across
  _many_ fibers — which this problem doesn't have yet.

### Native TypeScript

- **Shape:** a small class + a phase union (`idle | connecting | connected |
backingOff | closed`, with a `ready/sending` sub-flag) + one `AbortController` +
  a parked deferred (the `PendingAck` already in `connection.ts`) + the existing
  read loop. Essentially "what we have, minus XState" — `connection.ts` is already
  this style.
- **Pros:** zero new dependencies; mainstream async/await + `AbortSignal`
  (instant team velocity); linear stack traces; lean bundle; aligns with the
  project's design philosophy (§1 don't over-engineer, §5 mainstream patterns, §6
  real Promises).
- **Cons:** retry/timeout/cancel are hand-written, not composed; resource cleanup
  is explicit `finally`/lock-release (easy to miss a path); the phase machine is
  implicit in flags unless you type it deliberately.

### Recommendation — **native TS for this scope; revisit Effect only if the runtime grows.**

For one socket with one in-flight request, a plain class + deferred + AbortSignal
is the simplest thing that handles the real failure modes — and the data plane
(`connection.ts`) is _already_ that. Effect would solve the one thing XState
couldn't (the bridge), but it reintroduces the very cost we're trying to shed:
machinery and learning curve out of proportion to the problem, plus a real bundle
ask on library consumers. The design philosophy points the same way.

**Choose Effect instead if** the broader runtime is heading toward Effect anyway
(multiple connections / pools, server + client sharing an Effect core, typed
errors and structured concurrency as a house style) — then the consistency and
composition are worth it, and `Deferred`/`Scope`/`Schedule` make this client a
clean, small citizen of that world. It's a _portfolio_ decision, not a
_this-client_ one.

To make either future cheap, the native version should keep two seams explicit so
an Effect (or queue) swap is localized: (1) the **phase** as a typed union, not
scattered booleans; (2) the **request/response bridge** (`PendingAck`) as the one
place a result reaches a caller.

---

## 7. Suggested first steps for the next branch

1. Branch from `main` (not from the XState branch); copy in the §1 reuse set
   (`connection.ts`, `errors.ts`, `backoff.ts`, `ack.ts`, `runtime/node.ts`) and
   the whole test suite. The tests are the spec.
2. Decide native-TS vs Effect using §6 — a _portfolio_ call. If unsure, start
   native; it's the smaller bet and the data plane is already native.
3. Build the control layer (replacing `state.ts`): phase as a typed union,
   single-flight gate, the `connect`/`send`/`close` legality from §4, retry/backoff
   from `backoff.ts`, the connect abort/orphan contract from §3.11.
4. Make the existing test suite pass — that proves the §3 regression checklist is
   preserved — then add any new cases the new design exposes.
5. Keep PR #667 open as the measured XState reference until the new
   implementation is green and reviewed; close it then.

**Closing note.** The XState attempt was not wasted: it produced a fully-specified
contract, a hardened data plane, a complete test suite, and a verified
understanding of _why_ a state machine is the wrong fit here. That clarity is the
real output, and it's what this baseline hands forward.
