---
"@glion/mllp-client": minor
---

Replace the `makeRunOnce` + `settle` racing pattern in `exchange()` with standard `AbortSignal`-driven cancellation.

The old design imperatively guarded promise resolution with a "first call wins" flag and routed five concurrent code paths (deadline, frame-decode error, write, read, success) through five separate `settle(...)` callbacks. Correct, but reinventing what `AbortSignal` is built for, and forcing the body of `exchange()` into a `new Promise()` constructor with an inner `void (async () => {})()` IIFE.

The new design:

- `Deadline` is now just `{ signal: AbortSignal; cancel(): void }`. The timer aborts the controller with a typed `MllpClientError` as the reason; awaiters can re-throw `signal.reason` directly.
- `exchange()` is a plain `async` function with top-down `try/catch/finally`. It composes the deadline's signal with a local `AbortController` (used only for the frame decoder's `onError`) via the standard `AbortSignal.any()`.
- When the combined signal fires, an abort listener calls `writer.abort(reason)` and `reader.cancel(reason)` — standard Web Streams cancellation. Any pending `write()` / `read()` rejects with the same typed reason. No custom `Promise.race`, no `raceAbort` helper.
- `makeRunOnce` is deleted; `internal/run-once.ts` is gone.
- The IIFE is gone — `exchange()` itself is `async`.
- Error handling consolidates into a single `catch` block (was duplicated across five `settle` callbacks).

`engines.node` bumps from `>=18` to `>=20` because `AbortSignal.any()` requires Node 20+.

The wire-level behaviour is unchanged: same error codes, same fields on thrown errors, same lifecycle (graceful FIN on success, hard close on failure). All 37 existing tests pass without modification, and the existing TIMEOUT test now also asserts that the typed `signal.reason` propagates verbatim through the abort path.
