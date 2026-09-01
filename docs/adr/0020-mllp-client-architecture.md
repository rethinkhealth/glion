# ADR 0020: MLLP Client Architecture — a Single-Owner Mailbox Actor

## Status

Proposed

## Context

The maintainer ordered a full rewrite of `@glion/mllp-client` (2026-09-01): the current design is "convoluted", and the package "can become the most used package in our ecosystem if built properly" — the bar is robust, composable, easy to work on and review.

The current implementation (`packages/mllp-client/src`: client.ts 402, connection.ts 306, inbox.ts 161, ack.ts 179, outbound.ts 81, errors.ts 189, runtime/node.ts 131) collected 20 inline review threads on PR #669, and they all condemn one structure: five independent async contexts — the connect attempt, the send caller, the read loop, the closed-watcher, and the deadline timers — mutate shared lifecycle state and defend against each other.

The concrete symptoms, each anchored in a thread: errors smuggled through `AbortController.abort(reason)` and re-derived in a catch ("fragile abortReason… out of context", "routing errors is so fragile", "hate the complex logic"); phase juggling across `#phase`/`#connecting`/`#connectController`/`#inFlight` ("not an elegant code", "how to manage transitions… whether Effect could be a good framework"); a hand-rolled pull-queue whose captured settlers re-implement the platform ("too much complexity… not a standard contract", "pendingTake… extremely confusing and obsolete", "doing the job of someone else… design pattern problem"); a one-macrotask `setTimeout(0)` ordering prayer in drop detection; and an open concurrency doubt ("Is this robust?? Any risk of concurrency??").

Verified code-review findings compound this: F1 CONFIRMED (unvalidated timeouts — `Infinity`/`NaN`/`>=2^31` collapse to a ~1 ms timer, instantly and permanently killing the client, CLI-reachable); F6 (connection-terminality decided by ALLOWLISTING codes in `exchange`'s catch, so a novel post-write failure leaves a desynchronized wire looking connected); F7 (the `setTimeout(0)` encodes an undocumented `MllpDuplex` ordering requirement); F15 (`close()` early-returns on `phase === "closed"` without joining in-flight teardown).

Two prior attempts inform this decision and are documented in `docs/mllp-client-rewrite-baseline.md`: an XState v5 client (PR #667, green and reviewed) whose post-mortem (§5) concluded "the dominant operation (send→ACK) is ask, and XState has no ask", and the framework-free #669 implementation whose hand-plumbed internals drew the threads above. The baseline's §6 Effect-vs-native analysis concluded native for this scope and named Effect a portfolio decision. The maintainer's thread at client.ts:181 explicitly re-opened the framework question.

Binding constraints any design must preserve: ADR 0018's error contract (one `MllpClientError` base discriminated by the shipped 10-code `MllpErrorCode`; the `@glion/ack` `AckException` family as the separate NAK bucket; throw-on-NAK; §6 message style with strings asserted in tests), ADR 0019's client half (ERR-8→`text` fallback now, ERR-2→`location` when `@glion/ack` ships it), clean-on-send / AST-first (issue #685 re-opens only parser INJECTION), single-flight with `ALREADY_SENDING`, terminal-connection semantics, "reconnect in / message-retry out", and the documented-not-defended `MllpDuplex`/`MllpConnector` adapter contract.

## Decision

### 1. One owner: a mailbox actor with run-to-completion dispatch

All mutable state lives in one discriminated union — `idle | connecting{waiters, abort, timer} | connected{wire, pending, stash} | closed{reason, teardown}` — written by exactly one synchronous function, `handle(msg)`, draining a FIFO mailbox run-to-completion.

Three commands (`connect`/`send`/`close`, each carrying a reply Deferred) and seven facts (`wireOpen`/`wireOpenFailed`/`connectDeadline`/`frame`/`eof`/`writeFailed`/`sendDeadline`) are the only inputs; every async effect — the adapter connect, the socket write, the read pump, teardown, both deadline timers — reports back exclusively by posting a fact.

Races become mailbox orderings, each an explicit cell in a [4 phase × 10 message] matrix with a named test; the check for "any risk of concurrency?" is one sentence: there is exactly one mutator, and it never yields mid-decision (`handle` is non-async by signature; an accidental `await` is a type error).

Command handlers are `never`-exhaustive per phase with no default arms, so adding a phase or command is a compile error until every cell is decided and no caller's reply can be silently swallowed; facts share a deliberate, tested straggler fallthrough ("first reason won"), replacing today's detached `.catch(() => {})` guards with visible table rows.

Handlers never throw: the codecs are total by contract (every failure, including a custom parser's throw, returns a discriminated outcome), and the drain releases its latch in `finally` and rethrows, so a violated invariant is loud, never a wedged mailbox.

### 2. Five modules, strict downward dependencies

`duplex.ts` (the `MllpDuplex`/`MllpConnector` contract types and tightened JSDoc), `state.ts` (unions, Deferred, constants), `codec.ts` (`createMessageCodec(parser)` — outbound.ts + ack.ts merged, parser bound once, `decode` returning `AckOutcome = accepted | rejected(AckException) | invalid(MllpClientError)`), `wire.ts` (`createWire(duplex, post, maxBufferedBytes)` — read pump, lifetime writer, stream quirks), `actor.ts` (the owner), `client.ts` (the one sanctioned class: validation, composition, thin methods); errors.ts and runtime/node.ts carry over nearly verbatim; connection.ts and inbox.ts are deleted.

The actor receives `openWire: (signal) => Promise<Wire>` as an injected dependency, so it imports no stream types and is tested with a stub `Wire` and posted deadline messages — synchronously, with no fake timers.

### 3. Terminality by construction (F6 inverted)

`fail(error)` is the only path that concludes a send with a wire-layer `MllpClientError`, and it unconditionally transitions to `closed` and starts `wire.close()`; the `frame` handler's exhaustive switch on `AckOutcome` keeps `connected` only for `accepted` and `rejected` (a NAK — the peer answered properly, per ADR 0018's opposite-retry-semantics rationale); pre-wire errors are non-terminal by position, not by exemption; the allowlist in `exchange`'s catch is deleted.

`fail()` derives the stored closed-reason exactly as today (SEND_TIMEOUT / INVALID_RESPONSE wrapped in a DROPPED reason with the trigger on `cause`), so later `CLOSED` errors keep their cause chains and the existing tests stay green.

### 4. Cancellation: deadlines are messages; one AbortController

Deadline timers post `connectDeadline` / `sendDeadline{pending}` facts; the handler that processes the message constructs the typed error at the decision site; nothing ever reads `signal.reason`; the sole AbortController does the one WHATWG-specified job of cancelling the in-flight connector attempt; `sendDeadline` carries the `Pending` identity so a stale timer is provably ignorable.

F1 is fixed at the public boundary: `assertTimeoutMs` requires a finite value in (0, 2^31−1] and throws `RangeError` naming the option and received value — platform convention (fetch, Node validators), not a new `MllpErrorCode`.

### 5. Adapter contract: kept, tightened, conformance-tested

The `MllpDuplex`/`MllpConnector` shapes are unchanged; drop detection moves exclusively to the read pump's done/error branch, so frames precede EOF in the mailbox by Web Streams ordering on graceful close and `watchForDrop`'s `setTimeout(0)` is deleted (F7); the contract gains two testable sentences — "`readable` MUST settle a pending read on teardown, delivering pre-close bytes first on graceful close" and "`close()` MUST resolve even while the streams are locked by the client" — shipped as a reusable `describeMllpDuplexContract()` suite that node.test.ts runs today and every future Deno/Bun/Workers adapter reuses.

### 6. Public surface: preserved, with four declared deltas

The class, methods, getters, option names, defaults, state strings, response shape, and the 10-code taxonomy are byte-compatible; the deltas: `parser?` option defaulting to `parseHL7v2` for both directions (resolves #685, candidate (a); both FIXME markers die); `RangeError` on invalid numeric options (F1); an ACK without MSA-2 throws `INVALID_RESPONSE` and `controlId` is guaranteed non-empty (the maintainer's :261 directive — the `?? ""` at ack.ts:126 and the README's `controlId: ""` row are removed); `close()` mid-write uniformly rejects `CLOSED` (previously raced CLOSED/DROPPED — an implementation leak).

Explicitly not added: events, `stream()`, reconnect hooks, a caller `AbortSignal` on `send()`, `sendNoThrow` — no consumer demands them; reconnect stays a future construction-time option, cheap under the actor (a `backingOff` phase is new table rows).

## Consequences

- The maintainer's concurrency question has a structural answer, and every historically doubted interleaving is an enumerable, named, synchronous test — the actor matrix plus permutation suites replace fake-timer choreography.
- connection.ts, inbox.ts, the abortReason plumbing, `watchForDrop`, and both "internal invariant violated" strings are deleted, not improved; source drops from 1,476 to ≈1,205 LOC while adding F1 validation, the parser option, the ERR-8 fallback, and the F15 teardown join.
- Zero new runtime dependencies; the package stays reviewable by any TypeScript engineer, at the cost of one internal pattern (post, don't call) that a ~20-line architecture header and the matrix tests must keep honest — a future contributor adding an `await` or a state write inside an effect would reintroduce the old disease, and review must enforce the invariant the compiler only partially checks.
- Future work has declared seams: a FIFO queue is a `stash`-like array of pending sends; reconnect is a `backingOff` phase; an Effect migration, if the portfolio ever flips, maps mechanically (mailbox→Queue, reply→Deferred, `fail()`'s unconditional close→Scope finalizer).
- `docs/mllp-client-rewrite-baseline.md` and `docs/plans/2026-05-28-001-feat-mllp-client-rebuild-plan.md` are superseded by this ADR (both contradict shipped semantics — e.g. the baseline's §3.6 "send timeout stays connected" and §4 `SEND_IN_PROGRESS`/`ALREADY_CONNECTED` codes); ADR 0018's §2/§3 drift (typed fields that never shipped; `raw`/`tree` on exceptions; `@glion/mllp-ack` references) is corrected in the same change.
- The MSA-2 strictness is a deliberate compatibility trade: a legacy peer that never echoes MSA-2 now fails loudly instead of correlating silently; the escape hatch is a future explicit option, not a silent default.

## Alternatives considered

- **Improve the current hand-plumbed implementation in place.** Rejected: the 20 threads condemn the structure, not the polish — five cooperating mutators with guard-based safety is the disease, and every fix (better comments on `#inFlight`, a tidier abortReason catch) preserves it. The review threads would recur on the next feature.
- **Layered functional pipeline with atomic tagged-union swaps (wire → exchange → session → facade).** The most faithful reading of the design philosophy (zero deps, the platform's `reader.read()` as the pull queue, mainstream async/await) and the cheapest migration — but its safety rests on per-await discipline (synchronous-prefix checks plus an identity-commit rule at seven resumption sites) and ordered which-signal-aborted classification in catch blocks: better-organized versions of exactly the shapes threads :219/:254/:340 condemned. Adversarial review also found a dead-connected hole in its one-shot-peer drop watcher. Its adapter conformance suite and its "delete the inbox, use the platform reader" insight are adopted; its discipline-based concurrency model is not.
- **Pure reducer core with effects-as-data and an interpreting runtime (TEA/Elm style).** Equally race-proof — the same single-writer run-to-completion argument — and the best pure-test story; its codec outcome union and `never`-exhaustiveness discipline are grafted wholesale. Rejected as the core because it adds a second concept (a Dial/StartTimer/Resolve effect vocabulary plus a ticket→settler interpreter) for near-identical guarantees, its net LOC is roughly flat where the mailbox deletes ~270 lines, and a 3 a.m. debugger hops facade→reducer→runtime where the mailbox handler does the work directly (§1: the simplest version that handles the real failure modes).
- **XState v5 statechart (#667 corrected: exchange as states, emit + correlation-seq ask bridge).** Rejected on the project's own post-mortem, which survives the corrections: the dominant operation is ask, and every workaround remains ceremony — the reply bridge is still an emit+seq+Deferred map; XState final states cannot receive events, so post-close legality leaks back into the facade; and the run-to-completion macrostep — the framework's one decisive property — is what the mailbox drain provides in ~15 dependency-free lines. It would also add 14.1 KB gzipped to every consumer of a healthcare library and trade "reviewable by any TS engineer" for "reviewable by an XState-fluent one". #667's legality-table test matrix is mined as test names; the framework is not adopted.
- **Effect (scoped resources, Deferred, Queue, fiber interruption, behind an unchanged Promise facade).** The primitives genuinely fit — `Deferred` is the ask XState lacked, and inbox.ts hand-rolled a worse Queue — but the baseline §6 verdict stands unrefuted: for one socket with one in-flight request, the machinery and learning curve are out of proportion, ~60% of Effect's value (the typed error channel) dies at the `runPromiseExit` boundary, the ~100 KB bundle estimate is unverified, and an Effect island in a plain-TS monorepo narrows the contributor pool for the intended flagship package — its subtlest failure modes (interruptibility regions, FiberFailure leakage) are invisible to a reviewer without fluency. This is a portfolio decision, not a this-client one; the mailbox keeps the swap mechanical (mailbox→Queue, reply→Deferred, `fail()`→finalizer) if the portfolio ever commits, and this ADR should be revisited then.

## Related

- [ADR 0018: Errors, Exceptions, and Acknowledgments in the HL7v2 Ecosystem](./0018-error-and-acknowledgment-model.md)
- [ADR 0019: Acknowledgment Translation](./0019-acknowledgment-translation.md)
- [ADR 0011: MLLP Transport & Server](./0011-mllp-transport-server.md)
- `docs/mllp-client-rewrite-baseline.md` (superseded by this ADR; retained as the XState post-mortem record)
- PR #667 (XState reference implementation; closed when this lands), PR #669 (the implementation under review), issues #685 (parser injection; resolved by §6), #686 (teardown observability; §5's `closed`-as-observability stance is compatible)
