---
"@glion/mllp": minor
---

Breaking: `ctx.req` is the message that arrived, an `MllpRequest`, read by the app's processor before routing.

- Move `ctx.ast` to `ctx.req.tree`, `ctx.file` to `ctx.req.file`, and `ctx.result()` to `ctx.req.result()`. Remove `ctx.tree()`.
- Move the routing fields to `ctx.req.header`, a `MessageHeader` read from the MSH before routing: `ctx.messageType` becomes `ctx.req.header.messageCode` (MSH-9.1), and `ctx.triggerEvent`, `ctx.messageStructure`, `ctx.controlId` and `ctx.version` become `ctx.req.header.triggerEvent`, `.messageStructure`, `.controlId` and `.version`.
- Add `processingId` (MSH-11.1), `acceptAckType` (MSH-15) and `applicationAckType` (MSH-16) to `ctx.req.header`.
- Rename `RoutePattern.messageType` to `messageCode`, and `matchPattern()`'s second parameter with it.
- Export the `MllpRequest` and `MessageHeader` types.
