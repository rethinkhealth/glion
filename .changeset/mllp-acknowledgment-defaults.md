---
"@glion/mllp": minor
---

Breaking: the server replies with the acknowledgment of every message, the way an HTTP framework builds a response.

- Reply `AA` when a route handler returns nothing, or a value that is not a response. Add `ctx.ack(options?)`, which returns the acknowledgment of the message as a reply, with the same options as `acknowledge()`: `ctx.ack({ code: AckCode.CommitAccept })`.
- Reply to a thrown `AckException` with its `code` in MSA-1. Any other error replies `AE`. No reply carries MSA-3, so neither an error's `message` nor an `AckException`'s `text` is sent.
- Answer a message no route matches with `AR`. Before, it got no reply. An `ACK`, and a payload that does not start with an MSH such as an empty frame, get no reply unless a handler or middleware gives one.
- `await next()` no longer throws. After it, `ctx.error` is the error the message raised and `ctx.res` its reply; log the error or replace the reply there. Move a `try`/`catch` around `next()` to a check of `ctx.error`.
- Code after `await next()` now runs when the route handler fails, and a reply it writes replaces the NAK. A middleware that answers every message, such as `await next(); ctx.res = ctx.ack();`, answers a failure with `AA`: write the reply only when `ctx.error` is unset, or let the route handler give it.
- Keep the reply a route handler or middleware returned when a middleware throws after it. A reply a middleware writes to `ctx.res`, before or after `next()`, is replaced by the NAK of an error.
- Answer the first error a message raised. A later error, such as one a middleware throws after the route handler did, replaces `ctx.error` but not the reply; a middleware that wants to keep the first passes it as the new error's `cause`.
- Answer a `next()` called a second time as a middleware throw, with `MllpServerError` `NEXT_CALLED_TWICE`, which the second call also throws.
- Remove `app.onError()` and the `ErrorHandler` type; a middleware that reads `ctx.error` after `next()` replaces it.
- Decode the payload as UTF-8 in `app.handle(payload, connection)`, which takes the MLLP frame payload and drops its leading text argument. A payload that is not UTF-8 (`MllpServerError` `INCOMPATIBLE_CHARSET`) or that the parser throws on runs only the global middleware and is answered `AE`, echoing the sender's MSH-10, whatever they return or write; its routing fields are read from its MSH. A route filter that throws runs only the global middleware and is answered as a throw. Before, a payload that was not UTF-8 got no reply.
- Build every acknowledgment from the MSH as the app's parser read it: the transforms `ctx.tree()` runs do not change it.
- Make `ctx.error` and the routing fields (`ctx.messageType`, `ctx.triggerEvent`, `ctx.messageStructure`, `ctx.version`, `ctx.controlId`) read-only.
- `serve({ onError })` no longer fires for an error a message raised, and no longer receives `messageInfo`. Remove `getMessageInfo()` and the `MessageInfo` type.
