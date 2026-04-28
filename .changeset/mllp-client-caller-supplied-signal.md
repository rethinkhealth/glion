---
"@glion/mllp-client": minor
---

Polish the `AbortSignal` architecture and add caller-supplied cancellation to `MllpClient.send()`.

**New: `client.send(message, { signal? })`**

Mirrors the `fetch(url, { signal })` pattern. The caller's signal is composed with the client's internal timeout via the standard `AbortSignal.any` so either source aborts the exchange. Typical use: tie a batch of `send()`s to an app-shutdown `AbortController` so they all cancel cleanly when the process exits.

```ts
const controller = new AbortController();
process.on("SIGINT", () => controller.abort(new Error("shutting down")));

await client.send(message, { signal: controller.signal });
```

When the caller's signal aborts, the resulting `MllpClientError` has `code: "TIMEOUT"` and forwards the caller's `signal.reason` as its chained `cause`.

**`subscribeAbort()` helper**

Each runtime adapter previously had ~10 lines of `signal.aborted` / `addEventListener` / `removeEventListener` boilerplate. Extracted to a single `subscribeAbort(signal, onAbort): () => void` helper in `core/internal/`. Each adapter shrinks accordingly; the "aborted vs aborting" branching collapses into one shape.

**`normaliseExchangeError` precedence is now explicit**

Documented and tightened:

1. Signal aborted with a typed `MllpClientError` reason → return verbatim
2. Signal aborted with any other reason → wrap as `TIMEOUT` with the caller's reason chained as `cause` (caller cancellation conceptually IS a timeout from the protocol's perspective)
3. Stream rejection that's already typed → return unchanged so adapter-specific failures are preserved
4. Otherwise wrap as `CONNECTION_CLOSED`

**New `SendOptions` type**

Exported from every entry point (core, default, node, deno, workers) so callers can type the second argument to `send()` if they need to.

**Tests (37 → 39)**

Two new core tests:

- Caller-supplied signal aborts mid-exchange → `TIMEOUT` with caller's reason chained as `cause`; round-trip resolves at ~50ms despite a 60s timeout (proves the caller's signal won the race).
- Pre-aborted caller signal → `TIMEOUT` without the deadline ever firing.

The wire-level behaviour is unchanged for callers that don't supply a signal — they get the same shape they had before. `engines.node` was already `>=20` (required for `AbortSignal.any`).
