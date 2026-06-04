---
"@glion/mllp": minor
---

Decode inbound payloads in the runtime-agnostic core and route decode/parse failures to the error handler instead of bypassing the server.

- `Mllp.handle(payload, connection)` now takes the de-framed payload **bytes** (not pre-decoded text). `createContext` decodes (UTF-8) and parses in the runtime-agnostic core, so every transport adapter behaves identically and the Node `serve.ts` adapter just forwards the payload.
- A non-UTF-8 or unparseable payload no longer throws out of band. `createContext` is total — a decode or parser failure yields an empty `Root` recorded on `ctx.error` — and `handle()` hands that failure straight to the error path through a single try/catch: the **same destination as a thrown handler error**. The app's `onError` is invoked (and can build a NAK), otherwise it re-throws to `serve()`. This matches how Hono (`try { compose } catch { #handleError }`) and Koa route every failure to one top-level handler, rather than injecting a synthetic throwing step into the middleware chain. A non-UTF-8 frame still reaches `onError` as a `MllpServerError` (`code: INCOMPATIBLE_CHARSET`) with the codec's `CharsetError` on `cause` — unchanged from #659/#660, now produced by the core.
- **Breaking:** `Context.req.bytes` is removed (nothing read it). `ctx.req.raw` is the decoded text (`""` when the payload is not UTF-8), and the new `ctx.error` records the decode/parse failure. Direct `handle()` callers must pass the payload bytes and drop the leading text argument.
