# @glion/mllp-client — production-readiness review and feature plan

**Date**: 2026-09-03
**Status**: Draft for maintainer decision
**Scope**: What `@glion/mllp-client` must have before it can claim the role ADR 0020 states for it ("the most used package in our ecosystem"), measured against what mature persistent-connection clients (ioredis, node-postgres, kafkajs, the MongoDB driver, undici) treat as non-negotiable.

## 0. A blocking precondition: the ADR does not describe the code

ADR 0020 is `Proposed` and specifies a **mailbox actor**: a FIFO inbox, a synchronous non-`async` `handle(msg)`, seven fact messages, five modules (`duplex.ts`, `state.ts`, `codec.ts`, `wire.ts`, `actor.ts`), and a `[4 phase x 10 message]` race matrix.

What shipped in #691 is a **single-file compare-and-swap client**: `client.ts` (696 LOC), `codec.ts`, `errors.ts`, `constants.ts`, `types.ts`, `runtime/node.ts`. State is an immutable phase union mutated through `#transition(from, next)`, which commits only if `this.#state === from` — an _identity-commit rule checked at each resumption site_. That is, near-verbatim, the alternative ADR 0020 rejected:

> **Layered functional pipeline with atomic tagged-union swaps.** ... its safety rests on per-await discipline (synchronous-prefix checks plus an identity-commit rule at seven resumption sites) ... Its ... discipline-based concurrency model is not [adopted].

Other declared ADR 0020 §6 deltas are also split: MSA-2 strictness and the ERR-8 fallback shipped (`codec.ts`); the `parser?` option did not (#685 still open); invalid numeric options throw `MllpInvalidOptionError`, not the `RangeError` §4 specified.

**Why this blocks the feature plan.** Every Tier-0 feature below adds phases and interleavings. Reconnect alone adds a `backingOff` phase and a queue-drain edge; a send queue adds a stash whose entries outlive a phase change. Under the mailbox actor those are new _table rows_. Under compare-and-swap they are new _resumption sites where a human must get the identity check right_ — and the count grows superlinearly with phases. Building Tier 0 on the shipped design is the decision that determines whether the 20 review threads on #669 recur.

**Decision required before any feature work:**

- **(a)** Implement ADR 0020 as written, then build features as table rows. Cost: one rewrite of a 696-LOC file that is currently green.
- **(b)** Accept the shipped design, rewrite ADR 0020 to record _it_ as the decision (with the alternatives re-scored honestly), and accept discipline-based safety for the feature set below.
- **(c)** Keep ADR 0020 `Proposed` and add features to the shipped client. **Not recommended** — it leaves the package's flagship design record contradicting its own source, which is the exact drift the ADR criticises in ADR 0018 §2/§3.

Recommendation: **(a)**, and land it before Tier 0. The features below are what make the actor's cost worth paying; a lockstep-only client genuinely does not need it.

## 1. The comparison

MLLP-relevant table stakes across widely-used persistent-connection clients:

| Capability                                | ioredis                | pg                   | kafkajs                | mongodb          | undici                | **mllp-client**                    |
| ----------------------------------------- | ---------------------- | -------------------- | ---------------------- | ---------------- | --------------------- | ---------------------------------- |
| Auto-reconnect with backoff               | `retryStrategy`        | pool-level           | yes                    | SDAM             | yes                   | **no — every failure is terminal** |
| TLS                                       | yes                    | yes                  | yes                    | yes              | yes                   | **no** (server has it)             |
| Requests accepted while busy/unavailable  | offline queue          | pool queue           | yes                    | yes              | yes                   | **no — `ALREADY_SENDING`**         |
| Lifecycle events / instrumentation        | events                 | events               | instrumentation events | SDAM events      | `diagnostics_channel` | **no**                             |
| Per-request cancellation                  | partial                | `AbortSignal` (8.11) | —                      | `AbortSignal`    | `AbortSignal`         | **no**                             |
| Connection pooling                        | cluster                | `pg.Pool`            | broker pool            | core             | `Pool`                | **no**                             |
| Liveness detection while idle             | `PING`                 | keepalive            | heartbeat              | heartbeat        | keepalive             | TCP keepalive only (#690)          |
| Graceful drain vs. immediate stop         | `quit` / `disconnect`  | `end` / `destroy`    | yes                    | yes              | `close` / `destroy`   | `close()` only                     |
| Retry with delivery-safety classification | `maxRetriesPerRequest` | —                    | idempotent-producer    | retryable writes | yes                   | `delivery` field only              |
| Injectable logger                         | yes                    | —                    | yes                    | yes              | —                     | **no** (and `console.*` is banned) |

Two protocol facts constrain how these translate:

1. **MLLP is lockstep per connection.** Pipelining is impossible; concurrency means _more connections_. So the pool is not an optimisation, it is the only throughput knob.
2. **HL7v2 has no PING.** There is no standard application-level liveness probe. Liveness must come from the transport (TCP keepalive, FIN/RST) — which is why #690 is a dependency of reconnect, not a nicety.

## 2. Tier 0 — cannot ship a flagship client without these

These four are one architectural cluster. Shipping them separately churns the state machine four times; ADR 0020's matrix makes them cheap _together_.

### T0-1. Send queue — replace `ALREADY_SENDING` with serialization

**Gap.** A second concurrent `send()` throws `MllpAlreadySendingError`. Every consumer with more than one producer (an HTTP gateway — #658 — a worker pool, a fan-in router) must therefore build its own mutex, and get its backpressure and ordering right, before it can use the client at all.

**Why it is table stakes.** ioredis's offline queue and pg's pool queue exist precisely because "you called while I was busy" is not an answer a client may give. No mainstream client makes the caller serialise.

**Shape.** FIFO stash of pending sends; `send()` resolves when _its_ exchange completes. Bounded (`maxQueueSize`, default finite) with a typed `MllpQueueFullError` on overflow so backpressure is visible rather than a memory leak. `ALREADY_SENDING` is deleted from the taxonomy — a breaking change, and the right one.

**Open question for the maintainer:** does queue depth interact with `sendTimeoutMs`? Recommendation: the send deadline starts when the message reaches the wire, and a separate `queueTimeoutMs` bounds the wait — otherwise a deep queue reports `SEND_TIMEOUT`/`delivery: "unknown"` for messages that never left the process, which is a _clinically_ wrong answer.

### T0-2. Reconnect with backoff

**Gap.** "A client closes once and never reconnects ... a new client is the way back." A single network blip permanently kills the client. Every long-lived consumer must therefore implement supervision, backoff, and jitter.

**Why it is table stakes.** This is the ioredis feature users cannot operate without. A daemon that reconstructs its client on every drop is re-implementing the client's job in the application.

**Shape.** Construction-time option (ADR 0020 already declares the seam: a `backingOff` phase). Exponential backoff with full jitter, capped; `maxRetries`/`maxDelayMs`; off by default or on by default is a decision — recommend **on by default** with a bounded policy, because "silently terminal" is the more surprising default for a healthcare interface.

**Hard constraint.** Reconnect must never resend a message with `delivery: "unknown"`. Reconnect is a _connection_ concern; message retry is a _policy_ concern (T1-4). The existing "reconnect in / message-retry out" rule holds and must be stated in the option's JSDoc.

### T0-3. Lifecycle observability

**Gap.** There is no way to observe anything. `client.state` is a poll-only getter, and CLAUDE.md §8 (correctly) bans `console.*` in libraries.

**Why it is table stakes, and why it is a hard dependency of T0-2.** The moment reconnect exists, a client can spend an hour in a backoff loop while `send()` callers see only queue latency. A reconnect storm that no operator can see is worse than a terminal client. Every peer client solves this: ioredis events, kafkajs instrumentation events, mongodb SDAM events, undici `diagnostics_channel`.

**Shape.** Not an `EventEmitter` (Node-only; the package is runtime-agnostic by design). Recommend construction-time callbacks — `onStateChange`, `onConnectionLost`, `onReconnectAttempt` — typed, synchronous, and documented as "must not throw". This satisfies #470's "hooks, not a backend" requirement at the client layer, and #686's teardown-observability ask on the server side gets the symmetric treatment.

### T0-4. TLS (#657)

**Gap.** `connectNode` opens a raw `node:net` socket. The server already supports TLS (`packages/mllp/src/node/adapter.ts`), and `glion send --local` _deliberately errors_ against a TLS-configured local server rather than connecting insecurely.

**Why it is table stakes.** Every client in the table has it. In healthcare it is stronger than convention: IHE ATNA requires TLS with mutual authentication for transport of PHI, so a plaintext-only client is unusable for a conformant deployment.

**Shape decision required.** `MllpConnector` takes `{ host, port, signal }` and nothing else, so TLS config has nowhere to live. Two options:

- **(i)** Ship `connectNodeTls(tlsOptions)` — a _factory_ returning an `MllpConnector`, closing over cert/key/ca/servername/rejectUnauthorized. Zero change to the connector contract; TLS config stays runtime-specific where it belongs.
- **(ii)** Widen the connector opts with an adapter-config passthrough. Leaks runtime concerns into the core type.

Recommendation: **(i)**. It keeps the "a connection carries bytes and nothing else" contract intact and is how `undici`'s `connect` option works.

Also required: passphrase handling must follow #577 (env var, not manifest), and `glion send` needs the flags.

## 3. Tier 1 — required for real production operation

### T1-1. Idle drop detection (#690)

Needed _by_ T0-2 (reconnect cannot start while the client believes a dead socket is `connected`) and it makes `delivery` honest: today a send onto an already-dead socket reports `DROPPED`/`unknown` when the truthful answer is `CLOSED`/`not-sent`. Option 1 in #690 (a `closed` promise back on the `MllpConnection` contract) is the one that composes with reconnect.

### T1-2. Per-send `AbortSignal`

Universal in modern clients; one message in the actor matrix. Directly required by the HTTP→MLLP gateway example (#658): when the HTTP client disconnects, the in-flight send must be cancellable. Note the semantics carefully — aborting after the write means `delivery: "unknown"`, and abort must dequeue-not-cancel for a message still in the T0-1 queue (`delivery: "not-sent"`).

### T1-3. Connection pool (`MllpPool`)

The only throughput knob MLLP offers. Real interfaces run 4–16 parallel connections. Build it as a **sibling of the client, not inside it** — `pg.Pool` owning `pg.Client`s is the precedent, and it keeps `MllpClient` honest about lockstep. Depends on T0-1/T0-2 (a pool of clients that die permanently is not a pool).

**Ordering caveat to document loudly:** a pool destroys HL7v2 message ordering. Interfaces that require in-order delivery (many ADT feeds do) must use a single client, or the pool must offer a partition key. Recommend shipping `MllpPool` with an explicit ordering warning and no key in v1.

### T1-4. Retry policy with delivery-awareness (#646)

`delivery: "not-sent" | "unknown"` is the primitive; the policy is missing. **Must be opt-in and default off**: a duplicated ADT^A01 or ORM is a clinical safety event, and receiver-side dedup by MSH-10 is off by default in Mirth and implementation-dependent elsewhere. Ship: retry only `delivery: "not-sent"` by default; `unknown` requires the caller to opt in explicitly per-send. Do **not** auto-generate MSH-10 (it would silently defeat receiver dedup) — that stays #646's open question and the answer should be "no".

### T1-5. Drain vs. destroy

Once T0-1 exists, `close()` forks: `close()` should drain the queue then close; `destroy()` should reject queued sends with `delivery: "not-sent"` and stop now. Precedent: `quit`/`disconnect`, `end`/`destroy`. Today's `close()` becomes `destroy()`; the new `close()` needs a bounded drain deadline.

## 4. Tier 2 — mature-client expectations, not blocking

- **Metrics/OpenTelemetry hooks (#470)** — falls out of T0-3 once the callbacks exist. Add send latency, ACK code distribution, queue depth, reconnect count.
- **Injectable structured logger** — same mechanism as T0-3; keeps §8 intact.
- **`ping()` / health surface** — no standard HL7v2 probe exists. Options are a configurable probe message or transport-only liveness. Recommend transport-only (T1-1) and _no_ `ping()` until a consumer asks, with the reasoning recorded so it is not re-litigated.
- **ACK conformance validation (#668, #670)** — reading ACKs through the unified pipeline rather than `codec.ts`'s hand-read paths.
- **Batch BHS/BTS streaming (#505)**.
- **MSH-18 / charset correctness (#671, #662)** — the client encodes UTF-8 unconditionally while MSH-18 may declare otherwise. This is a correctness bug, not a feature; it is tracked separately and should not wait on this plan.

## 5. Explicitly not adopted

Recording these so they are not re-proposed:

- **`stream()`** — MLLP is lockstep; there is nothing to stream. (ADR 0020 §6.)
- **`sendNoThrow`** — the typed error taxonomy plus `delivery` is the answer.
- **Auto-generated MSH-10** — silently defeats receiver-side dedup.
- **Retry on by default** — duplicate PHI is a clinical safety issue.
- **`EventEmitter`** — Node-coupled; the package is runtime-agnostic by design.

## 6. Sequencing

| Step | Work                                                                                                                                      | Depends on          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 0    | Resolve §0: adopt ADR 0020's actor, or rewrite the ADR to match the shipped design                                                        | —                   |
| 1    | **T0-4 TLS** — orthogonal to the state machine, ships immediately, closes the server/client asymmetry and unblocks conformant deployments | 0 (nothing, really) |
| 2    | **T1-1 idle drop** — restores `closed` on the connection contract                                                                         | 0                   |
| 3    | **T0-1 + T0-2 + T0-3 + T1-5** as one change: queue, reconnect, observability, drain/destroy                                               | 0, 2                |
| 4    | **T1-2 AbortSignal**                                                                                                                      | 3                   |
| 5    | **T1-4 retry policy**                                                                                                                     | 3                   |
| 6    | **T1-3 `MllpPool`**                                                                                                                       | 3                   |
| 7    | Tier 2                                                                                                                                    | 3                   |

Step 1 first because TLS is the only Tier-0 item that does not touch the state machine, and it is the one that currently makes the client unusable for a real deployment rather than merely awkward.

Steps 3 is deliberately one change, not four PRs: reconnect without a queue has no answer for a send that arrives during backoff; a queue without drain semantics has no answer for `close()`; reconnect without observability is unoperable. Landing them together is one state-machine review instead of four.

## 7. Breaking-change budget

The package is pre-1.0 and already shipped one breaking rewrite (#669, #691). This plan adds: `ALREADY_SENDING` removed (T0-1), `close()` semantics changed and `destroy()` added (T1-5), reconnect changing the meaning of "terminal" (T0-2). Recommend landing steps 1–3 as a single major before 1.0 rather than spreading breaks across releases.

## Related

- ADR 0020 (`docs/adr/0020-mllp-client-architecture.md`), ADR 0018, ADR 0019
- Issues: #657 (TLS), #690 (idle drop), #646 (idempotency/retry), #470 (observability), #685 (parser injection), #668/#670 (ACK conformance), #658 (HTTP→MLLP gateway), #671/#662 (charset)
