---
"@glion/mllp": minor
---

Breaking: the server replies with the acknowledgment of every message, the way an HTTP framework builds a response.

- Reply `AA` when a route handler returns nothing, or a value that is not a response. Add `ctx.ack(options?)`, which returns the acknowledgment of the message as a reply, with the options of `acknowledge()` and an accept code (`AckOptions`): `ctx.ack({ code: AckCode.CommitAccept })`. A NAK is the reply to a throw.
- Reply to a thrown `AckException` with its `code` in MSA-1. Any other error replies `AE`. No reply carries MSA-3, so neither an error's `message` nor an `AckException`'s `text` is sent.
- Answer a message no route matches with `AR`. Before, it got no reply. An `ACK` gets no reply unless a handler or middleware gives one.
- `await next()` no longer throws. After it, `ctx.error` is the error the message raised and `ctx.res` its reply; log the error or replace the reply there. Move a `try`/`catch` around `next()` to a check of `ctx.error`.
- Code after `await next()` now runs when the route handler fails, and a reply it writes replaces the NAK. A middleware that answers every message, such as `await next(); ctx.res = ctx.ack();`, answers a failure with `AA`: write the reply only when `ctx.error` is unset, or let the route handler give it.
- Reply to the latest error a message raised. An error a middleware throws after the route handler replied replaces the reply with its NAK, and a middleware changes the NAK's code by throwing an `AckException` with the error it answers as its `cause`. A reply a middleware returns or writes to `ctx.res`, before or after `next()`, replaces the one before it.
- Answer a `next()` called a second time as a middleware throw, with `MllpServerError` `NEXT_CALLED_TWICE`, which the second call also throws.
- `app.onError(handler)` only observes the error of a payload no middleware runs on, one that is not UTF-8 or that the parser throws on. `ErrorHandler` is `(error, env) => Promise<void> | undefined`; it no longer receives a context or gives the response, and each handler registered runs. A middleware that reads `ctx.error` after `next()` handles every other error.
- Decode the payload as UTF-8 in `app.handle()`. A payload that is not UTF-8 (`CharsetError`) or that the parser throws on runs no middleware and no route; `app.onError()` observes the error, and the reply is its NAK, `AE` unless the parser threw an `AckException`, echoing the MSH-10 read from the bytes before the first CR. A payload whose MSH is not UTF-8 gets no reply. A route filter that throws runs only the global middleware and is answered as a throw. Before, a payload that was not UTF-8 got no reply.
- Remove `MllpServerErrorCode.INCOMPATIBLE_CHARSET`: `app.onError()` observes the `CharsetError` that `@glion/util-charset` throws, which has the same `code`.
- Run the processor's transformers, lint rules among them, before routing. `parseHL7v2` from `@glion/hl7v2` sets its profile rules to `"error"`, so a message missing a segment or field its event schema requires is now answered `AE` before routing. `ctx.tree()` resolves to `ctx.ast`, and only `ctx.result()` stays lazy.
- Read each message with `@glion/parser` and `@glion/lint-required-message-header` at `"error"` when `app.parser()` is not called, so a message that does not start with an MSH is rejected. Remove `MllpServerErrorCode.NO_PARSER`. A processor given to `app.parser()` must report a fatal message for a message that does not start with an MSH.
- Remove `ctx.req.bytes`; `ctx.req.raw` holds the decoded payload.
- Build every acknowledgment from the MSH of the tree the processor read, as it is when the acknowledgment is built.
- Make `ctx.error` and the routing fields (`ctx.messageType`, `ctx.triggerEvent`, `ctx.messageStructure`, `ctx.version`, `ctx.controlId`) read-only.
- `serve({ onError })` no longer fires for an error a message raised, and no longer receives `messageInfo`. Remove `getMessageInfo()` and the `MessageInfo` type.
- Add `new Mllp(options?)` with `timeZone` and `delimiters`, which every acknowledgment the app writes uses: the default `AA`, the NAK of a thrown error, and `ctx.ack()`; an unknown `timeZone` throws a `RangeError` from the constructor.
- Add the `serializer` option to `new Mllp(options?)`, which writes every response as HL7v2 text; it defaults to `toHl7v2` from `@glion/to-hl7v2`.
- Give `MllpServerError` one fixed message per `code`, held in the class: its constructor takes the code and an optional `cause`. Reword the `PROTOCOL_VIOLATION` message.
