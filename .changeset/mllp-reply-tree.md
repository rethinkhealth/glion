---
"@glion/mllp": minor
---

Breaking: reply with a `Reply`, built by `ctx.ack()` or `ctx.reply()`, which `app.handle()` resolves to as bytes.

- Return the reply from a route handler: a `Reply`, or `null` for no reply. Any other return value, `undefined` included, is answered `AE`, and `ctx.error` is an `MllpServerError` `INVALID_REPLY`. Before, a route handler returned `{ raw }`, and returning nothing replied `AA`.
- Add `ctx.ack(options?)`, the acknowledgment of the message as a `Reply`, with the options of `acknowledge()` and an accept code (`AckOptions`): `ctx.ack({ code: AckCode.CommitAccept })`.
- Add `ctx.reply(message)`, which returns any other HL7v2 message as a `Reply`, such as a query response. `ctx.ack()` and `ctx.reply()` serialize the message when called.
- Reply only with an accept. `ctx.ack()` throws `REPLY_IS_NAK` for a NAK code, and `ctx.reply()` throws it for a message whose MSA-1 is a NAK code, and `REPLY_WITHOUT_MSH` for one that does not start with an MSH. A NAK is the reply to a throw.
- Make `ctx.res` a `Reply`, whose `code` is its MSA-1. A middleware returns a `Reply`, `null` for no reply, or nothing; a value that is not a `Reply`, returned or written to `ctx.res`, is answered `AE` with `INVALID_REPLY`.
- Resolve `app.handle()` to the reply's UTF-8 bytes. `handleConnection()` and `serve()` take a `handle` that resolves to bytes.
- Remove the `Response` type and `{ raw }` replies.
- Add the `Reply` and `AckOptions` types, and the `MllpServerError` codes `INVALID_REPLY`, `REPLY_IS_NAK` and `REPLY_WITHOUT_MSH`.
