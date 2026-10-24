# ADR 0019: Acknowledgments Built Into the App

## Status

Proposed (revised 2026-10-24)

Built by the stack #1075 ← #1078 ← #1076 ← #1091. This revision replaces the 2026-10 proposal of the same number, which put the reply rules behind `app.onError()`, a `MessageOutcome` envelope, and a version table inside the server; none of those were built.

## Context

An MLLP receiver answers every message with an acknowledgment, and the answer decides what the sender does next. `AA` means "processed, do not send again". `AE` means "it failed here, you may resend". `AR` means "rejected, do not resend". A wrong answer is not cosmetic. An `AA` for a message nothing processed loses it, and an `AE` for a message already saved makes the sender resend it, so it is saved twice.

Until this stack, `@glion/mllp` sent whatever reply the application built by hand, and nothing otherwise. Each application wrote its own `MSH|…\rMSA|…` strings. A message no route matched got no reply, and an error's `message`, which can carry PHI, could reach MSA-3. The server should answer the way an HTTP framework does: a handler returns its response, and the framework answers what the handler did not.

## Decision

### 1. The app is the core, and `handle()` is its one entry point

`app.handle(payload, env?)` takes one message as bytes without MLLP framing and resolves to the reply as bytes, or `undefined` for none. It knows HL7v2 and nothing about sockets. `env` becomes `ctx.env`, typed by `Mllp<E>`, the way Hono passes a Workers environment.

Runtimes drive it through adapters:

- **`handleConnection(handle, socket, { signal })`** runs MLLP framing over any `MllpSocket` (Web Streams `readable` and `writable`, plus `close()`), one message at a time. It has no runtime dependency, so it ships in `@glion/mllp`.
- **`serve({ handle, port, tls, … })`** in `@glion/mllp/node` owns ports, TLS, connection hooks and shutdown, and passes `NodeEnv { connection }`. A Workers inbound-TCP adapter will hand its sockets to the same `handleConnection()`.
- **Tests, and later HTTP or Lambda,** call `handle()` directly.

The reply rules below therefore live in `handle()`, the runtime-independent core, and never in a runtime adapter.

### 2. A reply is an HL7v2 message as a tree

A route handler returns its reply as a `Root`, or `null` for no reply. `ctx.ack()` builds the acknowledgment of the message, and any other message (a query response, for example) is returned as its own tree. Middleware read and edit `ctx.res` as a tree. `handle()` serializes it once, at the end, with `@glion/to-hl7v2`, which escapes VT and FS, so no reply can break MLLP framing.

Any other value a route handler returns, `undefined` included, is answered `AE` with `MllpServerError` `INVALID_REPLY`, and so is a value that is not a message that a middleware returns or writes to `ctx.res`. A handler must say what it replies.

`ctx.ack(input?)` takes nothing (`AA`), a text (`AA` with that text in MSA-3), `AcknowledgeOptions`, or an error: the NAK that error would get if it were thrown.

### 3. Throwing is a failure, returning is a decision

A thrown error is recorded in `ctx.error`, so logging middleware see it. A returned NAK, such as `return ctx.ack(new AckApplicationReject(…))`, is the handler's decision and leaves `ctx.error` unset. Both give the same reply.

### 4. The default replies

| What happened                                          | Reply                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| The route handler returns a message                    | that message                                                          |
| It returns `null`                                      | none                                                                  |
| It returns anything else                               | `AE` · MSA-3 `Application internal error` · `INVALID_REPLY`           |
| It throws an `AckException`                            | its `code` in MSA-1, its `text` in MSA-3                              |
| It throws anything else                                | `AE` · MSA-3 `Application internal error`                             |
| No route matches                                       | `AR` · MSA-3 `Unsupported message type`                               |
| A route filter throws                                  | as a throw, after the global middleware only                          |
| The payload is not UTF-8, or the parser throws         | `AE`, after the global middleware only, whatever they return or write |
| The message is an `ACK`, or does not start with an MSH | none, unless a handler or middleware gives one                        |

An error's `message` is never sent; only an `AckException`'s `text` reaches MSA-3. `isAckException()` in `@glion/ack` recognizes an exception made by any installed copy of the package, so a second copy never turns an `AR` into an `AE`.

A payload that did not decode or parse was never read, so it is never accepted: the global middleware observe it, and the reply stays `AE`. An `ACK` is never acknowledged, so two receivers cannot answer each other's acknowledgments forever. A payload with no MSH, such as an empty keep-alive frame, has no MSH-10 to acknowledge.

### 5. Errors are caught where they are thrown; `next()` never throws

`compose()` catches at every level of the middleware onion, the route handler's included. The error goes to one place, which records it in `ctx.error` and builds its NAK, and the level around it resumes after `await next()`. A middleware reacts to an error by reading `ctx.error` after `next()`, never with a `try`/`catch` around it. A second call to `next()` throws `NEXT_CALLED_TWICE` to its caller and is answered as a middleware throw.

There is no `app.onError()` and no `app.notFound()`. A middleware that reads `ctx.error` after `next()` and writes or returns a reply does what both did, with one mechanism instead of two.

### 6. The first outcome decides the reply

- **A reply the route handler or a middleware returned stands.** A later throw does not replace it. A reply a middleware writes to `ctx.res`, before or after `next()`, stands until an error replaces it.
- **The first error decides the NAK,** and the NAK is built once.
- **A later error replaces `ctx.error` but not the reply.** A middleware that wants to keep the earlier error passes it as its own error's `cause`.

Hono lets the latest error replace the response. That is wrong for MLLP. When a handler has saved a message and returned `AA`, an audit middleware failing after it would turn the `AA` into an `AE`, and the sender would resend a message that was already saved. A logging or audit failure is the operator's problem, reported through `ctx.error`, not the sender's.

### 7. The acknowledgment answers the MSH as the app's parser read it

`acknowledge(origin, options?)` builds an MSH and an MSA. It swaps MSH-3/4 with MSH-5/6, copying each field whole, writes MSH-9 as `ACK^<trigger>^ACK` (`ACK^<trigger>` before v2.3.1), echoes MSH-11 and MSH-12.1, and echoes MSH-10 in MSA-2. `ctx.ack()` passes it the processor's own tree, so an app with its own `preprocess` is acknowledged correctly. `ctx.tree()` copies the MSH before the transforms run, so they never change the acknowledgment. A payload with no tree has its first segment parsed alone.

### 8. Version conformance is not the acknowledgment's job

MSA-3 is withdrawn (`W`) from v2.7, where the standard refers the reader to the ERR segment: ERR-3 (HL7 Error Code, Table 0357), ERR-4 (Severity) and ERR-8 (User Message). `acknowledge()` does not branch on MSH-12. #1084 proposes that producers write the version-neutral union (MSA-3 and an ERR segment) and that one profile-driven transform conforms it to the message's version. That keeps what each version allows in one place, the profile data, instead of in every producer.

### 9. The application's logger reports errors; the library never logs

A message's errors reach the application through `ctx.error`. `serve({ onError })` reports what no message owns: a throwing `onConnect` or `onDisconnect`, a `handle()` rejection such as `NO_PARSER`, broken MLLP framing (`PROTOCOL_VIOLATION`), and a socket fault other than a reset, a broken pipe or a timeout. The connection closes after the last three. Without `onError`, those errors are not reported; `serve()` writes nothing to the console.

## Consequences

- **Wire behaviour changes, and partners will see it.** An unrouted message is answered `AR` instead of nothing. A handler's throw is answered with a NAK instead of nothing. An error's `message` no longer reaches MSA-3. An empty frame still gets no reply.
- **Every route handler returns its reply.** `return ctx.ack()` replaces returning nothing; TypeScript rejects a handler that returns nothing, and an untyped one is answered `AE` with `INVALID_REPLY`.
- **Code after `await next()` now runs when the route handler fails.** A middleware that writes a reply there replaces the NAK, so it checks `ctx.error` first. A `try`/`catch` around `next()` no longer sees errors.
- **The examples and the CLI drop their hand-written ACKs** and their `app.on("*")` catch-alls. The CLI's telemetry middleware reads MSA-1 from `ctx.res` as a tree.
- **Until #1084 lands,** a NAK to a v2.7 or later message carries MSA-3, which the receiver ignores, and no ERR segment, so it states no reason.
- **Deferred:** the ERR segment and its conformance (#1084); reading MSH-15/16 for enhanced-mode acknowledgment; the `201` (Unsupported event code) refinement of an unrouted reject; ERR-2 locations on `AckException`; `app.fetch()` for HL7v2 over HTTP.

## Alternatives considered

- **An acknowledgment middleware the app installs** (the former `ackMiddleware`). Rejected: its position in the onion is movable and optional. Registered late, it missed errors thrown before it; an unrouted message looked like a successful one; and its catch hid every error from the operator.
- **`app.onError()` and `app.notFound()` beside middleware.** Rejected by the maintainer: a middleware that reads `ctx.error` after `next()` already does both, and one mechanism is simpler than two.
- **`handle()` returning `{ response, error, info }`, with `serve()` reporting the error.** Rejected: it puts message decisions in the runtime adapter, and every new runtime would repeat them.
- **Returning nothing means `AA`.** Built in #1078, then reversed in #1091: a forgotten `return` would accept a message silently, and an explicit reply reads the same in every handler.
- **The latest error decides the reply** (Hono). Rejected for the duplicate-processing reason in §6.
- **`ctx.error` as an `AggregateError` of every error.** Rejected: `ctx.error instanceof DatabaseUnavailable` would stop matching whenever a second error happened, and chaining errors through `cause` is the thrower's choice.
- **A version table inside `acknowledge()`.** Rejected: conformance spread across producers drifts; it belongs to one profile-driven step (§8).
- **Re-parsing the MSH from the payload text.** Built, then replaced: once the processor has parsed the message, the tree is the message, and a second parse ignored the app's own preprocessing.

## Related

- [ADR 0011: MLLP Transport Server](./0011-mllp-transport-server.md): its middleware-first error handling is superseded; its default-NAK decision is kept, without sending the error's message.
- [ADR 0013: MLLP Lazy Pipeline Execution](./0013-mllp-lazy-pipeline-execution.md)
- [ADR 0018: Errors, Exceptions, and Acknowledgments in the HL7v2 Ecosystem](./0018-error-and-acknowledgment-model.md): `AckException` stays data-only and bidirectional; `text` is the field that reaches MSA-3.
- [ADR 0031: Escape Sequences Are Decoded by the Parser and Encoded by the Serializer](./0031-escape-sequences-decoded-by-the-parser.md)
- #1084: version conformance of outbound messages
