---
"@glion/mllp": minor
---

Route inbound decode/parse failures through the server pipeline instead of bypassing it.

- `Mllp.handle(payload, connection)` now takes the de-framed payload **bytes** (not pre-decoded text). The UTF-8 decode moves out of the Node `serve.ts` adapter and into the runtime-agnostic core, so every transport adapter behaves identically and decode happens once.
- A non-UTF-8 or unparseable payload no longer throws out of band. `createContext` is total — it yields an empty `Root` and sets the new `ctx.error` — and `handle()` re-throws the failure from _inside_ the middleware chain. So with an acknowledgment middleware registered, a bad-charset frame now becomes an `AE` NAK on the wire (it previously surfaced only through `onError` with no response, #659). With no ack middleware it still reaches `onError`, as a `MllpServerError` (`code: INCOMPATIBLE_CHARSET`) carrying the codec's `CharsetError` on `cause` — unchanged.
- **Breaking:** `Context.req.bytes` is removed (nothing read it). `ctx.req.raw` is now the decoded text (`""` when the payload is not UTF-8), and the new `ctx.error` carries the decode/parse failure. Direct `handle()` callers must pass the payload bytes and drop the leading text argument.
