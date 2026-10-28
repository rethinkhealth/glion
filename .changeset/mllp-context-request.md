---
"@glion/mllp": minor
---

Breaking: `ctx.req` is the message that arrived, an `MllpRequest`, read by the app's processor before routing.

- Move `ctx.ast` to `ctx.req.tree`, `ctx.file` to `ctx.req.file`, and `ctx.result()` to `ctx.req.result()`. Remove `ctx.tree()`.
- Export the `MllpRequest` and `MessageHeader` types.
