---
"@glion/mllp-client": patch
---

Replace the custom `Deadline` interface with the standard `AbortSignal.timeout(ms)` + `AbortSignal.any([...])` pattern.

`Deadline` had three jobs: provide a typed-reason `AbortSignal`, lazily build the timeout error message, and offer `cancel()` to clear the underlying timer. All three become unnecessary once you use the platform primitives correctly:

- **Typed reason**: `AbortSignal.timeout(ms)` aborts with the standard `DOMException(name: "TimeoutError")`. We translate it into `MllpClientError(TIMEOUT)` at the single catch site (`normaliseExchangeError`).
- **Lazy message**: the message is built only when the catch site sees the timeout — same effect, no factory function needed.
- **`cancel()`**: `AbortSignal.timeout()` uses an **unref'd** timer in Node, Bun, and Deno (per their respective specs and runtime implementations) and is benign in Cloudflare Workers (no Node-style event loop). The timer never holds the process alive after `send()` returns. The whole `cancel()` plumbing — the outer try/finally, the `Deadline` interface, the per-send disposable — was solving a problem that doesn't exist with the standard primitive.

The new `MllpClient.send()` body is:

```ts
const sources: AbortSignal[] = [AbortSignal.timeout(this.#timeout)];
if (options.signal) sources.push(options.signal);
const signal = AbortSignal.any(sources);
```

Three lines. Standard primitives only. No custom interface.

`normaliseExchangeError` gains a fourth precedence rule that recognises the `DOMException(TimeoutError)` reason produced by `AbortSignal.timeout()` and translates it to a typed `MllpClientError(TIMEOUT)` with the original budget in the message.

`internal/deadline.ts` is deleted. All 39 tests still pass without modification — including the timeout-message assertion that verifies the typed error still says `MLLP round trip exceeded Nms`.
