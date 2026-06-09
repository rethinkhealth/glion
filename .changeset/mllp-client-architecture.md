---
"@glion/mllp-client": patch
---

Internal refactor: make the XState machine the engine and split the package along clean seams. No public API or behaviour change; the full test suite is unchanged and green.

- **`state.ts` is the engine.** A pure (no-I/O) XState v5 machine owns the connection end-to-end: the lifecycle (`idle → connecting → connected → backingOff → closed`), single-flight sending (`connected` is compound, `ready`/`sending`), retry/backoff, teardown, and **every error decision**. It links to async I/O through invoked actors: `open` (a `fromPromise` — one-shot, abortable) and `wire` (a `fromCallback` — the only actor kind with an inbound channel, which the live socket needs to take writes down and push frames/drops up).
- **The result bridge.** XState is tell-not-ask and `emit` is not a request/response channel, so a caller's deferred travels with the request: `connect()`/`send()` hand the machine a `settle` ({resolve, reject}), and the machine settles it — directly for an illegal/failed operation (the machine constructs the typed `MllpClientError`), or via the wire for a send's ACK/NAK/timeout/drop. Nothing is parked in `context`, and there are no client-side error-arbitration helpers.
- **`client.ts` is a thin facade.** It encodes the outbound message at the boundary, turns each call into a machine event, and adapts the settled deferred back to a real `Promise`. No lifecycle state, no error synthesis.
- **`connection.ts` is the wire engine**, wrapped by the machine's `wire` actor: the persistent read loop, frame decoder, single-flight ACK deferred, and peer-drop detection. Its lifetime is bound to the `connected` state, so teardown on disconnect is a structural guarantee.
- **`backoff.ts`** — capped-exponential-with-full-jitter backoff math + `RetryOptions`. Retry is disabled by default (`NO_RETRY`), so `backingOff` is unreachable until a later version enables it. The Node adapter is at `runtime/node.ts`; the wire-agnostic FIFO queue lives at `queue.ts` (unit-tested, not yet wired).
