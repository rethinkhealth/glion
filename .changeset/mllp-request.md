---
"@glion/mllp": minor
---

Breaking: read each message before routing. `ctx.req` is the message that arrived, an `MllpRequest`, read by the app's processor.

- Run the processor's transformers, lint rules among them, before routing. `parseHL7v2` from `@glion/hl7v2` sets its profile rules to `"error"`, so a message missing a segment or field its event schema requires now reaches no route. Only compilation stays lazy.
- Run no middleware and no route for a payload that is not UTF-8, that the processor throws on, or that the processor reports a fatal message for: `app.handle()` rejects with the `CharsetError`, the processor's error, or the first fatal message.
- Read each message with `@glion/parser` and `@glion/lint-required-message-header` at `"error"` when `app.parser()` is not called, so a message that does not start with an MSH reaches no route. Remove `MllpServerErrorCode.NO_PARSER`. A processor given to `app.parser()` must report a fatal message for a message that does not start with an MSH.
- Remove `MllpServerErrorCode.INCOMPATIBLE_CHARSET`: `app.handle()` rejects with the `CharsetError` that `@glion/util-charset` throws, which has the same `code`.
- Move `ctx.ast` to `ctx.req.tree`, `ctx.file` to `ctx.req.file`, and `ctx.result()` to `ctx.req.result()`. Remove `ctx.tree()` and `ctx.req.bytes`; `ctx.req.raw` holds the decoded payload.
- Move the routing fields to `ctx.req.header`, a `MessageHeader` read from the MSH before routing: `ctx.messageType` becomes `ctx.req.header.messageCode` (MSH-9.1), and `ctx.triggerEvent`, `ctx.messageStructure`, `ctx.controlId` and `ctx.version` become `ctx.req.header.triggerEvent`, `.messageStructure`, `.controlId` and `.version`.
- Add `processingId` (MSH-11.1), `acceptAckType` (MSH-15) and `applicationAckType` (MSH-16) to `ctx.req.header`.
- Rename `RoutePattern.messageType` to `messageCode`, and `matchPattern()`'s second parameter with it.
- Export the `MllpRequest` and `MessageHeader` types.
