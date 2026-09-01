---
date: 2026-06-09
topic: mllp-client-pull-inbox-refactor
---

# MLLP client — pull-based inbox refactor (native)

## Problem Frame

The native `@glion/mllp-client` (branch `worktree-mllp-native`) is green (130 tests) and its facade/codec layers are sound, but `connection.ts` carries organically grown complexity: a push-based inbound path (read loop → waiter slot) that forces a registration-race stash (`pendingError`), a teardown latch (`dead`), and an owner-close flag (`closingExplicit`) threaded across five functions. Every maintainer review comment to date has poked at symptoms of this one inversion, and the roadmap (two-tier ACK, multi-flight) stresses it further. This work is a fresh-look restructuring for testability, maintainability, and extensibility — not a bug fix; current behavior is correct and pinned by tests.

## Requirements

- R1. **Public API unchanged.** `MllpClient` (`connect`/`send`/`close`,
  getters, `Symbol.asyncDispose`), option types, error codes, and the
  `MllpConnector`/`MllpDuplex` adapter contract are untouched. All 130 existing
  tests pass **unchanged** — they are the regression net, not a porting target.
- R2. **Pull-based inbound.** A new bounded, single-consumer frame inbox unit
  (small channel: `put` / `fail` / `take(deadline)`), independently
  unit-tested with zero I/O. The read loop _puts_; teardown _fails_; the
  exchange _takes_.
- R3. **`connection.ts` rewritten on the inbox.** The waiter slot,
  `pendingError` stash, and `closingExplicit`/`dead` web are replaced by the
  inbox's single internal latch. Every behavior in the baseline regression
  checklist (`docs/mllp-client-rewrite-baseline.md` §3) is preserved:
  persistent read loop, late-ACK buffering + correlation rejection, flood cap,
  send-timeout-stays-connected, slowloris partial reset, single drop
  notification, write-failure semantics, close-mid-send, orphan-close contract.
- R4. **Roadmap seams explicit.** The design leaves obvious, documented seams
  for: the FIFO send queue (client layer — **the first follow-up, PR 2**),
  retry/backoff (wire `backoff.ts`), two-tier ACK (two sequential `take`s per
  exchange), and a future Effect port (inbox ≈ `Queue`, deadline take ≈
  interruption, backoff ≈ `Schedule`, connection lifetime ≈ `Scope`). None of
  these features are built in this PR.
- R5. **No new runtime dependencies.** Native TypeScript only.

## Success Criteria

- Package green: 130 existing tests unchanged + new inbox unit tests;
  monorepo check-types/test green; lint 0/0.
- `connection.ts` is materially simpler: no waiter slot, no race stash, one
  teardown latch (inside the inbox), and the file reads top-to-bottom without
  cross-function invariant comments.
- A two-tier ACK exchange could be expressed as two `take`s without touching
  the inbox or read loop (demonstrated in a doc note or test sketch, not shipped).

## Scope Boundaries

- **Not building now:** FIFO queue, retry/backoff wiring, two-tier ACK,
  multi-flight correlation, the Effect port.
- **Not touching:** `ack.ts`, `backoff.ts`, `errors.ts`, `runtime/node.ts`,
  the codecs' behavior, error codes or messages (except where a message names
  internals that moved).

## Key Decisions

- **Native-first; Effect deferred.** Effect adoption is a portfolio decision
  (whole-runtime consistency), not a this-client decision. The refactor
  deliberately creates 1:1 Effect seams so a later port is mechanical rather
  than a rewrite — "native then port" stops being throwaway work.
- **Refactor behind a held contract, not a ground-up redo.** The facade,
  `Connection` contract, and test suite stay fixed; only `connection.ts`
  internals + the new inbox unit change.
- **Pull-based inbox replaces push + waiter slot.** Chosen because it
  dissolves the registration race _structurally_ (an early error/frame is just
  a stored item), collapses three flags into one latch, and makes the
  two-frame ACK flow trivial.
- **Queue first, as transparent FIFO (decided now, built in PR 2).** After the
  refactor, the first layered feature is the send queue: concurrent `send()`
  queues FIFO instead of rejecting — `SEND_IN_PROGRESS` is retired then; the
  per-send `timeoutMs` spans queue wait + wire time (a total-time bound); a
  generous defensive cap rejects pathological floods. Matches mainstream
  client behavior (Design Philosophy §5).
- **Two PRs.** PR 1 is this refactor under the held contract (all 130 tests
  unchanged — the regression proof). PR 2 is the queue, where the
  single-flight tests are deliberately rewritten and the changeset documents
  the `SEND_IN_PROGRESS` retirement. The two guarantees cannot share a PR.

## Dependencies / Assumptions

- The baseline doc (`docs/mllp-client-rewrite-baseline.md`) is the behavioral
  contract of record; its §3 checklist defines "no regression".
- PR #667 (XState reference) stays open per maintainer decision; unaffected.

## Outstanding Questions

### Resolve Before Planning

(none)

### Deferred to Planning

- [Affects R2][Technical] Module name/shape for the inbox (`inbox.ts` vs a
  generic channel; domain-aligned naming per maintainer preference — no
  implementation-leaky names).
- [Affects R3][Technical] Whether the `Connection` interface stays exactly
  `{ exchange, shutdown }` + `onDrop` option, or the drop notification moves
  to a return/contract shape that reads better with the inbox.
- [Affects R3][Technical] Final home of the slowloris decoder reset in the new
  exchange shape (expected: unchanged, in the timeout path of `exchange`).

## Next Steps

→ `/ce:plan` for structured implementation planning
