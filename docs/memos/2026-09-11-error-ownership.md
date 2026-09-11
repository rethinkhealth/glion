# Memo: who raises which error, and why the layers must not know each other

**Date**: 2026-09-11
**Scope**: `@glion/mllp-client`, and the rule every layered package in this repository follows from now on. Recorded in CLAUDE.md, Design Philosophy §3.

## The question

`@glion/mllp-client` has three layers. A **session** is one socket's lifetime: it opens, exchanges framed bytes, and ends. A **connection** is what the client holds for its whole life: it dials sessions under the reconnect policy, holds the one that is open, and dials again when it is lost. The **client** is the API: it sends one message at a time and matches the acknowledgment to it.

While building reconnect, errors started to leak across those layers in both directions. The client passed its typed failure into the connection so the connection could hand it back through a hook. The client also turned the session's raw signals, an end of stream and a stream error, into `CONNECTION_LOST`, a fact the session had observed and the client had not. Reviewing that raised the real question: which layer owns which error, and does the connection need to know how the client presents failures to its users?

## The principle

An error is a fact. It is raised by the layer that observed it, in the package's one error vocabulary, and it travels upward unchanged.

1. **Raise where observed.** The session holds the socket, so it raises the wire's facts: the dial was refused or timed out, no reply came in time, the remote hung up, the stream broke. The client holds the message, so it raises the message's facts: it cannot be sent as is, the reply is not this message's acknowledgment, the receiver refused it, a send is already in flight, the client is closed.
2. **Relay unchanged.** A layer above lets a lower fact propagate. It wraps with `cause` only where the meaning changes at its own boundary: the codec's "these bytes are not a frame" becomes the client's "this reply is not my acknowledgment", because only the client knows there was a message waiting. It never re-labels a fact into a class of its own.
3. **Never reach down.** A layer does not assemble a lower layer's fact from that layer's raw signals. When a layer finds itself doing that, the fact belongs one layer down.
4. **Carry facts, not interpretations.** Hooks, results, and state hold what the layer observed. The connection reports the failure _it_ gave up on. It never holds, and never returns, what the client made of an earlier failure.

## What this settles

**Are the connection's errors exposed to users?** Yes. A caller whose `send()` fails must know whether the wire failed or the message did, so the wire's facts are public classes with public codes. What is not exposed, and under rule 4 does not exist, is any interpretation the connection would have to know about.

**Why not a separate `MllpConnectionError` taxonomy for the lower layers?** Because rule 2 forbids it. If the session raised private errors, the client would have to translate each into the public class, which is a second taxonomy and a translation step that can drift. ADR 0018 already says a layer wraps with `cause` and never re-encodes another layer's failures. One error base per package; every layer raises from it.

**What `MllpConnectionError` is, then.** An abstract class between `MllpClientError` and the four wire failures: `MllpConnectFailedError`, `MllpConnectTimeoutError`, `MllpSendTimeoutError`, `MllpConnectionLostError`. It is a family marker in the one vocabulary, not a taxonomy: no new codes, no translation. The session and the connection type their failures as exactly the family they raise, and a caller can catch "the wire failed" in one `instanceof`.

## What changed in the code

- `session.exchange()` raises `MllpConnectionLostError` itself, on end of stream and on a stream error, with the stream error on `cause`. It no longer returns `null` or leaks raw errors, and its `@throws` list is the complete list of facts it can raise.
- `MllpConnectionLostError` no longer carries `controlId`. A transport fact has no message identity; the caller holds the message it sent.
- The client's `#exchange` relays: `MllpInvalidMessageError` passes through because nothing reached the wire, `MllpCodecError` is wrapped into `MllpInvalidResponseError` with `cause`, and every other `MllpClientError` is handed to `#fail` as it is. Anything else is rethrown as the bug it would be.
- `connection.reconnect()` takes no reason and returns whether it will dial again; the client, which owns its reason, closes with it when the answer is no. `onClose(failure)` fires only when dialing gave up, carrying the connection's own last failure.

## The vocabulary, after the redesign

Gathered from Node.js core (`name`, stable `code`, `cause`), undici (one class per situation over one base), the MongoDB driver (error labels a retry policy branches on), the AWS SDK (`$retryable` and `$fault` beside the code), and the Fetch standard (cancellation as its own error, distinct from network failure):

- One base, `MllpClientError`, with `name`, a fixed `code`, a fixed message, and `cause`. One class per situation. One code is one fact: `CLOSED` no longer doubles as "the send was cut off"; that is `SEND_ABORTED`.
- One label beside the code, `delivery`: `not-sent` or `unknown`. It is the only fact a retry decision needs, and it is decided by the layer that raised the error, never inferred above it. A NAK is the third answer and lives on `AckException`.
- One family marker for the wire, `MllpConnectionError`, so "the link failed" is one `instanceof`.
- One noun: `CONNECTION_FAILED`, `CONNECTION_TIMEOUT`, `CONNECTION_LOST`.

## How to apply it next time

Before adding a `catch` that constructs an error, ask two questions. _Which layer observed this?_ If not the one you are in, raise it there and relay. _What does this layer decide with the value it is about to hold?_ If nothing, it should not hold it. Both questions have one-word answers most of the time, and when they do not, the design is telling you something.
