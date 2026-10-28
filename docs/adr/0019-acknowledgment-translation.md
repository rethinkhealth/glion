# ADR 0019: Acknowledgments Built Into the App

## Status

Proposed (revised 2026-10-24)

Built by the stack #1075 ← #1078 ← #1076 ← #1091. This revision replaces the 2026-10 proposal of the same number, which put the response rules behind `app.onError()`, a `MessageOutcome` envelope, and a version table inside the server; none of those were built.

## Context

An MLLP receiver answers every message with an acknowledgment, and the answer decides what the sender does next. `AA` means "processed, do not send again". `AE` means "it failed here, you may resend". `AR` means "rejected, do not resend". A wrong answer is not cosmetic. An `AA` for a message nothing processed loses it, and an `AE` for a message already saved makes the sender resend it, so it is saved twice.

Until this stack, `@glion/mllp` sent whatever response the application built by hand, and nothing otherwise. Each application wrote its own `MSH|…\rMSA|…` strings. A message no route matched got no response, and an error's `message`, which can carry PHI, could reach MSA-3. The server should answer the way an HTTP framework does: a handler returns its response, and the framework answers what the handler did not.

## Decision

### 1. The app is the core, and `handle()` is its one entry point

`app.handle(payload, env?)` takes one message as bytes without MLLP framing and resolves to the response as bytes, or `undefined` for none. It knows HL7v2 and nothing about sockets. `env` becomes `ctx.env`, typed by `Mllp<E>`, the way Hono passes a Workers environment.

Runtimes drive it through adapters:

- **`handleConnection(handle, socket, { signal })`** runs MLLP framing over any `MllpSocket` (Web Streams `readable` and `writable`, plus `close()`), one message at a time. It has no runtime dependency, so it ships in `@glion/mllp`.
- **`serve({ handle, port, tls, … })`** in `@glion/mllp/node` owns ports, TLS, connection hooks and shutdown, and passes `NodeEnv { connection }`. A Workers inbound-TCP adapter will hand its sockets to the same `handleConnection()`.
- **Tests, and later HTTP or Lambda,** call `handle()` directly.

The response rules below therefore live in `handle()`, the runtime-independent core, and never in a runtime adapter.

### 2. A response is an `MllpResponse`, built by `ctx.ack()` or `ctx.reply()`

A route handler returns its response as an `MllpResponse`, or `null` for no response. `ctx.ack(options?)` builds the acknowledgment of the message with an accept code, `AA` or `CA`. `ctx.reply(message)` takes any other HL7v2 message as a tree, such as a query response. Both write the message with the app's `serializer` when they are called, so a tree that cannot be serialized fails in the handler that built it, and `handle()` resolves to the response's bytes. An `MllpResponse` is branded, and its fields are read-only: only those two methods make one, and TypeScript rejects a handler that returns a tree, a string or nothing. Its `code` is its MSA-1.

Any other value a route handler returns, `undefined` included, is answered `AE` with `MllpServerError` `INVALID_RESPONSE`, and so is a value that is not an `MllpResponse` that a middleware returns or writes to `ctx.res`. A handler must say what it replies.

### 3. A NAK is the response to a throw

A failure is thrown, and its NAK is the response (§4). A response only accepts: `ctx.ack()` throws `RESPONSE_IS_NAK` for a NAK code, and `ctx.reply()` throws it for a message whose MSA-1 is a NAK code, and `RESPONSE_WITHOUT_MSH` for one that does not start with an MSH. With one way to fail, `ctx.error` holds every failure, so a middleware that checks it before writing a response after `next()` sees them all.

### 4. The default responses

| What happened                                     | Response                                         |
| ------------------------------------------------- | ------------------------------------------------ |
| The route handler returns an `MllpResponse`       | that response                                    |
| It returns `null`                                 | none                                             |
| It returns anything else                          | `AE` · `INVALID_RESPONSE`                        |
| It throws an `AckException`                       | its `code` in MSA-1                              |
| It throws anything else                           | `AE`                                             |
| No route matches                                  | `AR`                                             |
| A route filter throws                             | as a throw, after the global middleware only     |
| The payload is not UTF-8, or the processor throws | its NAK, with no middleware run                  |
| The processor reports a fatal message             | the NAK of the first one, with no middleware run |
| The message is an `ACK`                           | none, unless a handler or middleware gives one   |

No response carries text: an error's `message` and an `AckException`'s `text` are never sent (§8). `isAckException()` in `@glion/ack` recognizes an exception made by any installed copy of the package, so a second copy never turns an `AR` into an `AE`.

The processor runs whole before routing, its lint rules included: what a message must be is the processor's to say, and the server reads only its fatal messages. The default processor, `@glion/parser` with `@glion/lint-required-message-header` at `"error"`, says a message starts with an MSH; one an app gives in its place MUST say so too. A payload that did not decode, that the processor throws on, or that it reports a fatal message for was never accepted, so no middleware or route runs on it, and no context is made for it. The server answers it with the NAK of the error, or of the first fatal message, `AE` unless the processor threw an `AckException`, the way an HTTP framework answers a body it cannot parse with a 400 or 415 before routing. The NAK answers the MSH read by `@glion/parser` from the bytes before the first CR, decoded strictly; a payload whose MSH is not UTF-8 gets no response, since nothing can be echoed as the sender wrote it. The server does not acknowledge an `ACK` by itself, so two receivers cannot answer each other's acknowledgments forever. A catch-all route matches an `ACK` too; an app leaves it unanswered with a route for `ACK` that returns `null`. A payload with no MSH, such as an empty keep-alive frame, has no MSH-10 to acknowledge, so it gets no response.

### 5. Errors are caught where they are thrown; `next()` never throws

`compose()` catches at every level of the middleware onion, the route handler's included. The error goes to one place, which records it in `ctx.error` and builds its NAK, and the level around it resumes after `await next()`. A middleware reacts to an error by reading `ctx.error` after `next()`, never with a `try`/`catch` around it. A second call to `next()` throws `NEXT_CALLED_TWICE` to its caller and is answered as a middleware throw.

There is no `app.notFound()`. `app.onError()` observes every error a message raises, when it is raised, as Hono's sees every error; unlike Hono's, it does not choose the response, which stays the NAK of `ctx.error`. A middleware that reads `ctx.error` after `next()` answers an error with another NAK by throwing. Each handler `app.onError()` registers runs, as with Fastify's `onError` hook and Koa's `error` event, so the CLI's telemetry and an application's own handler both see every error.

### 6. The latest outcome decides the response

- **A middleware replaces the response** by returning an `MllpResponse`, or `null` for none, or by writing `ctx.res`, before or after `next()`. One that returns nothing leaves it as it is.
- **An error replaces the response with its NAK,** whatever replied before it, and `ctx.error` holds the latest error. A middleware changes the NAK's code by throwing an `AckException` with the error it answers as its `cause`.

This is Hono's rule, and it has a cost in MLLP. When a handler has saved a message and returned `AA`, an audit middleware that fails after it turns the `AA` into an `AE`, and the sender resends a message that was already saved. A middleware whose own failure must not change the response catches that failure and reports it itself.

### 7. The acknowledgment answers the MSH as the app's parser read it

`acknowledge(origin, options?)` builds an MSH and an MSA. It swaps MSH-3/4 with MSH-5/6, copying each field whole, writes MSH-9 as `ACK^<trigger>^ACK` (`ACK^<trigger>` before v2.3.1), echoes MSH-11 and MSH-12.1, and echoes MSH-10 in MSA-2. `ctx.ack()` passes it the tree the app's parser read, as it is when the acknowledgment is built, so an app with its own `preprocess` is acknowledged correctly. A transform or a handler that changes the MSH before then changes the acknowledgment too; the routing fields keep the values as parsed. The NAK of a payload that did not decode or parse answers the MSH read from its bytes before the first CR (§4).

### 8. The acknowledgment is the same in every version, for now

`acknowledge()` writes only what every version from v2.1 to v2.8.2 accepts: MSH-1 to MSH-12, MSA-1 and MSA-2. A NAK states its reason in MSA-1 alone. The fields that carry a reason have no form every version accepts:

| Field                           | v2.1 – v2.4 | v2.5 – v2.6 | v2.7 – v2.8.2 |
| ------------------------------- | ----------- | ----------- | ------------- |
| MSA-3 (Text Message)            | `O`         | `B`         | `W`           |
| ERR-1 (Error Code and Location) | `R`         | `B`         | `W`           |
| ERR-3, ERR-4                    | not defined | `R`         | `R`           |

Leaving out MSA-3, which no version requires, is valid in all of them. Any ERR segment needs fields chosen by version. #1084 adds the reason back: producers write MSA-3 and an ERR segment, and one profile-driven transform conforms them to MSH-12, so what each version allows stays in the profile data instead of in every producer.

MSH-9 is the one exception. No form is valid in every version: v2.1 has no components, MSH-9.3 exists from v2.3.1, and it is required from v2.5, so `acknowledge()` reads MSH-12 to choose. That check is temporary and tracked in #1112; the same transform replaces it.

### 9. The application's logger reports errors; the library never logs

A message's errors reach the application through `ctx.error`. `serve({ onError })` reports what no message owns: a throwing `onConnect` or `onDisconnect`, a `handle()` rejection, such as a `serializer` that throws, broken MLLP framing (`PROTOCOL_VIOLATION`), and a socket fault other than a reset, a broken pipe or a timeout. The connection closes after the last three. Without `onError`, those errors are not reported; `serve()` writes nothing to the console.

## Consequences

- **Wire behaviour changes, and partners will see it.** An unrouted message is answered `AR` instead of nothing. A handler's throw is answered with a NAK instead of nothing. No response carries MSA-3, so an error's `message` no longer reaches the partner. An empty frame still gets no response.
- **Every route handler returns its response.** `return ctx.ack()` replaces returning nothing; TypeScript rejects a handler that returns nothing, and an untyped one is answered `AE` with `INVALID_RESPONSE`. A NAK is thrown, never returned.
- **An error after a saved message makes the sender resend it** (§6), unless the middleware that fails catches its own failure.
- **Code after `await next()` now runs when the route handler fails.** A middleware that writes a response there replaces the NAK, so it checks `ctx.error` first. A `try`/`catch` around `next()` no longer sees errors.
- **The examples and the CLI drop their hand-written ACKs** and their `app.on("*")` catch-alls. The CLI's telemetry middleware reads the response's `code`.
- **Until #1084 lands,** a NAK states no reason beyond MSA-1, in every version, and MSH-9 is chosen by a version check (#1112).
- **Deferred:** the ERR segment and its conformance (#1084); reading MSH-15/16 for enhanced-mode acknowledgment; the `201` (Unsupported event code) refinement of an unrouted reject; ERR-2 locations on `AckException`; `app.fetch()` for HL7v2 over HTTP.

## Alternatives considered

- **An acknowledgment middleware the app installs** (the former `ackMiddleware`). Rejected: its position in the onion is movable and optional. Registered late, it missed errors thrown before it; an unrouted message looked like a successful one; and its catch hid every error from the operator.
- **`app.onError()` and `app.notFound()` beside middleware.** Rejected by the maintainer: a middleware that reads `ctx.error` after `next()` already does both, and one mechanism is simpler than two. `app.onError()` came back as an observer of every error, which chooses no reply.
- **Running the global middleware on an unread payload.** Built, then removed: the middleware saw a tree read with U+FFFD for each byte that was not UTF-8, or an empty one, so the app could act on a message it never read. The NAK is forced, and `app.onError()` observes.
- **`app.onError()` observing only the payloads no middleware runs on.** Built, then widened: an application that logs its errors in `app.onError()`, as with Hono, would miss every handler failure.
- **Lint only when a handler builds the tree** (ADR 0013). Built, then replaced: a handler that never asked for the tree accepted a message the processor would have rejected, and the server needed a check of its own to know whether a message started with an MSH.
- **`handle()` returning `{ response, error, info }`, with `serve()` reporting the error.** Rejected: it puts message decisions in the runtime adapter, and every new runtime would repeat them.
- **Returning nothing means `AA`.** Built in #1078, then reversed in #1091: a forgotten `return` would accept a message silently, and an explicit response reads the same in every handler.
- **The first error decides the response.** Built, then reversed: one rule, the same as Hono's, and a middleware maps an error to another NAK by throwing it. The cost is the duplicate in §6.
- **Returning a NAK.** Built, then removed: a returned NAK left `ctx.error` unset, so a middleware that checked it before writing a response after `next()` turned the NAK into an accept, and `ctx.ack(error)` told an error from options with `instanceof`, which accepted a thrown string.
- **A tree as the response.** Built, then replaced by `MllpResponse`: a tree a handler returned was shared and edited in place, so a response reused across messages leaked between them, and a tree that could not be serialized was found only after every middleware had taken it as the response.
- **`ctx.error` as an `AggregateError` of every error.** Rejected: `ctx.error instanceof DatabaseUnavailable` would stop matching whenever a second error happened, and chaining errors through `cause` is the thrower's choice.
- **A version table inside `acknowledge()`.** Rejected: conformance spread across producers drifts; it belongs to one profile-driven step (§8). MSH-9's check is the one stopgap (#1112).
- **Writing MSA-3 in every version.** Built, then removed: it is withdrawn from v2.7, and the starting point writes only what every version accepts (§8).
- **Re-parsing the MSH from the payload text.** Built, then replaced: once the processor has parsed the message, the tree is the message, and a second parse ignored the app's own preprocessing.

## Related

- [ADR 0011: MLLP Transport Server](./0011-mllp-transport-server.md): its middleware-first error handling is superseded; its default-NAK decision is kept, without sending the error's message.
- [ADR 0013: MLLP Lazy Pipeline Execution](./0013-mllp-lazy-pipeline-execution.md): superseded in part; the processor runs before routing, and only compilation waits for `ctx.result()`.
- [ADR 0018: Errors, Exceptions, and Acknowledgments in the HL7v2 Ecosystem](./0018-error-and-acknowledgment-model.md): `AckException` stays data-only and bidirectional; the server sends its `text` once #1084 lands.
- [ADR 0031: Escape Sequences Are Decoded by the Parser and Encoded by the Serializer](./0031-escape-sequences-decoded-by-the-parser.md)
- #1084: version conformance of outbound messages
- #1112: the temporary MSH-9 version check in `acknowledge()`
