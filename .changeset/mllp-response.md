---
"@glion/mllp": minor
---

Breaking: reply with an `MllpResponse`, built by `ctx.ack()` or `ctx.reply()`, which `app.handle()` resolves to as bytes.

- Return the response from a route handler: an `MllpResponse`, or `null` for no response. Any other return value, `undefined` included, is answered `AE`, and `ctx.error` is an `MllpServerError` `INVALID_RESPONSE`. Before, a route handler returned `{ raw }`, and returning nothing sent no reply.
- Add `ctx.ack(options?)`, the acknowledgment of the message as an `MllpResponse`, with the options of `acknowledge()` and an accept code (`AckOptions`): `ctx.ack({ code: AckCode.CommitAccept })`. It answers the MSH of `ctx.req.tree` as it is when called, with the app's `timeZone` and `delimiters`.
- Add `ctx.reply(message)`, which returns any other HL7v2 message as an `MllpResponse`, such as a query response. `ctx.ack()` and `ctx.reply()` write the message with the app's `serializer` when called.
- Reply only with an accept. `ctx.ack()` throws `RESPONSE_IS_NAK` for a NAK code, and `ctx.reply()` throws it for a message whose MSA-1 is a NAK code, and `RESPONSE_WITHOUT_MSH` for one that does not start with an MSH. A NAK is the response to a throw.
- Make `ctx.res` an `MllpResponse`, whose `code` is its MSA-1. A middleware returns an `MllpResponse`, `null` for no response, or nothing; a value that is not an `MllpResponse`, returned or written to `ctx.res`, is answered `AE` with `INVALID_RESPONSE`.
- Resolve `app.handle()` to the response's UTF-8 bytes, serialized when the response was built.
- Remove the `Response` type and `{ raw }` replies.
- Add the `MllpResponse` and `AckOptions` types, and the `MllpServerError` codes `INVALID_RESPONSE`, `RESPONSE_IS_NAK` and `RESPONSE_WITHOUT_MSH`.
