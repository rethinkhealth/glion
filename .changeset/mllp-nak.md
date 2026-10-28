---
"@glion/mllp": minor
---

Breaking: answer every failure with a NAK, the way an HTTP framework answers a thrown error.

- Reply to a thrown `AckException` with its `code` in MSA-1. Any other error replies `AE`. No NAK carries MSA-3, so neither an error's `message` nor an `AckException`'s `text` is sent.
- Answer a message no route matches with `AR`. Before, it got no reply. An `ACK` gets no reply unless a handler or middleware gives one.
- `await next()` no longer throws. After it, `ctx.error` is the error the message raised and `ctx.res` its reply; log the error or replace the reply there. Move a `try`/`catch` around `next()` to a check of `ctx.error`.
- Code after `await next()` now runs when the route handler fails, and a reply it writes replaces the NAK: write the reply only when `ctx.error` is unset.
- Reply to the latest error a message raised. An error a middleware throws after the route handler replied replaces the reply with its NAK, and a middleware changes the NAK's code by throwing an `AckException` with the error it answers as its `cause`. A reply a middleware returns or writes to `ctx.res`, before or after `next()`, replaces the one before it.
- Answer a `next()` called a second time as a middleware throw, with `MllpServerError` `NEXT_CALLED_TWICE`, which the second call also throws.
- `app.onError(handler)` observes every error a message raises, when it is raised; it no longer receives a context or gives the response, and each handler registered runs. `ErrorHandler` is `(error, env) => Promise<void> | undefined`.
- Answer a payload that is not UTF-8, that the processor throws on, or that the processor reports a fatal message for with the NAK of the error, or of the first fatal message, `AE` unless the processor threw an `AckException`, echoing the MSH-10 read from the bytes before the first CR. A payload whose MSH is not UTF-8, or that has none, gets no reply. Before, `app.handle()` rejected. A route filter that throws runs only the global middleware and is answered as a throw.
- Build every NAK from the MSH of the tree the processor read, as it is when the NAK is built.
- Make `ctx.error` read-only.
- `serve({ onError })` no longer fires for an error a message raised, and no longer receives `messageInfo`. Remove `getMessageInfo()` and the `MessageInfo` type.
- Close the connection when `handle()` rejects, as when a `serializer` throws, and report the error to `onError`. Before, the connection stayed open and the message went unanswered.
- Remove `serve()`'s `console.error` fallback. Without `onError`, a connection's errors are not reported; pass `onError` to send them to your logger. `onError` must not throw.
- Add `new Mllp(options?)` with `timeZone`, `delimiters` and `serializer`, which every acknowledgment the app writes uses; `serializer` defaults to `toHl7v2` from `@glion/to-hl7v2`, and an unknown `timeZone` throws a `RangeError` from the constructor. Export the `MllpOptions` type.
