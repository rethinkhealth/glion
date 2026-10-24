---
"@glion/mllp": minor
---

Breaking: the server replies with the acknowledgment of every message, the way an HTTP framework builds a response.

- Reply `AA` when a route handler returns nothing, or a value that is not a response. Add `ctx.ack(options?)`, which returns the acknowledgment of the message as a reply, with the same options as `acknowledge()`: `ctx.ack({ code: AckCode.CommitAccept })`.
- Reply to a thrown `AckException` with its `code` in MSA-1 and its `text` in MSA-3. Any other error replies `AE` with MSA-3 `Application internal error`. An error's `message` is never sent.
- Answer a message no route matches with `AR` and MSA-3 `Unsupported message type`. Before, it got no reply. An `ACK` gets no reply unless a handler or middleware returns one.
- `await next()` no longer throws, except when called a second time; `app.handle()` then rejects with that error. After it, `ctx.error` is the first error the message raised and `ctx.res` its reply; log the error or replace the reply there. Move a `try`/`catch` around `next()` to a check of `ctx.error`.
- Keep a handler's or middleware's reply when a middleware throws after it. A second error, thrown once `ctx.error` holds one, makes `app.handle()` reject with it.
- Remove `app.onError()` and the `ErrorHandler` type; a middleware that reads `ctx.error` after `next()` replaces it.
- Decode the payload as UTF-8 in `app.handle(payload, connection)`, which takes the MLLP frame payload and drops its leading text argument. A payload that is not UTF-8 (`MllpServerError` `INCOMPATIBLE_CHARSET`) or that the parser throws on runs only the global middleware and is answered `AE`, echoing the sender's MSH-10, whatever they return; its routing fields are read from its MSH. A route filter that throws runs only the global middleware and is answered `AE`. Before, a payload that was not UTF-8 got no reply.
- Build every acknowledgment from the MSH as received: a change to the tree, or a parser that keeps escape sequences, does not change it.
- Make `ctx.error` and the routing fields (`ctx.messageType`, `ctx.triggerEvent`, `ctx.messageStructure`, `ctx.version`, `ctx.controlId`) read-only.
- `serve({ onError })` fires only for a throwing `onConnect` or `onDisconnect`, an `app.handle()` rejection, and `PROTOCOL_VIOLATION`, and no longer receives `messageInfo`. Remove `getMessageInfo()` and the `MessageInfo` type.
