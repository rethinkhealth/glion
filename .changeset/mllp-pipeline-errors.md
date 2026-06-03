---
"@glion/mllp": minor
---

Decode inbound payloads in the runtime-agnostic core and route decode/parse failures to the error handler instead of bypassing the server.

- `Mllp.handle(payload, connection)` now takes the de-framed payload **bytes** (not pre-decoded text). The UTF-8 decode moves out of the Node `serve.ts` adapter and into `handle()`, so every transport adapter behaves identically and decode happens once.
- A non-UTF-8 or unparseable payload no longer throws out of band. `decodeBytes` runs in `handle()`, `createContext` is total (a parser throw yields an empty `Root` recorded on `ctx.error`), and `handle()` hands any such failure straight to the error path — the **same destination as a thrown handler error**: the app's `onError` is invoked (and can build a NAK), otherwise it re-throws to `serve()`. This matches how Hono/Koa route pre-dispatch failures, rather than injecting a synthetic throwing step into the middleware chain. A non-UTF-8 frame still reaches `onError` as a `MllpServerError` (`code: INCOMPATIBLE_CHARSET`) with the codec's `CharsetError` on `cause` — unchanged from #659/#660, now produced by the core.
- **Breaking:** `Context.req.bytes` is removed (nothing read it). `ctx.req.raw` is the decoded text (`""` when the payload is not UTF-8), and the new `ctx.error` records a parser failure. Direct `handle()` callers must pass the payload bytes and drop the leading text argument.
