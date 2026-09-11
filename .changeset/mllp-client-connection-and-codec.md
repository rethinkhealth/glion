---
"@glion/mllp-client": minor
---

Rebuilds the client as a lockstep MLLP client: one socket to one remote system, one message on the wire at a time. `send()` writes the message, waits for the acknowledgment, checks that it answers this message, and resolves with it. There is no background reader and no queue. The lifecycle is one immutable phase object, replaced on every change, so a racing `close()` is detected rather than overwritten.

**Breaking: the client takes a socket, not a host and port.** `MllpClientOptions.socket` is an `MllpSocket` — `connect(signal)` hands over the byte streams, `close()` ends them. The Node adapter is `nodeSocket({ host, port })` from `@glion/mllp-client/node`, with `gracefulCloseMs` and `keepAliveIdleMs` as options. A third-party runtime implements the same two methods.

**Breaking: `send()` takes a parsed `Root`.** Text is parsed at the caller's boundary. The message must carry an MSH-10 control ID; one without it throws `MllpInvalidMessageError` before anything is written.

**Breaking: a NAK is thrown, not returned.** `AE`, `AR`, `CE` and `CR` reject with the matching `@glion/ack` exception — the same types the server raises — and leave the connection open. `MllpClientResponse` is the accept case only, and reports `id` (the acknowledgment's own MSH-10) separately from `controlId` (MSA-2, the message it answers).

**A reply is correlated before it is judged.** MSA-2 is read before MSA-1, so an accept or a NAK is only ever reported for the message it answers. A reply naming a different message fails with `MllpInvalidResponseError` whatever its MSA-1 says — previously a NAK skipped the correlation check entirely and was reported as the rejection of whichever message happened to be in flight.

**`close()` and `destroy()` are now different verbs.** `close()` lets the message in flight finish and refuses new sends from the moment it is called; `destroy()` ends the connection at once and rejects whatever was in flight with `MllpClientClosedError`. Both resolve from any phase, never reject, and are idempotent. `client.state` gains `closing`.

**Events.** `client.on(...)` / `off(...)` for `connect`, `disconnect` and `close`. `disconnect` carries the failure that ended the connection, or `null` when this process closed it.

**Errors are one class per situation**, each with a fixed `code`, in an `errors/` folder of one file per class. `MllpDroppedError` is now `MllpConnectionLostError` (`CONNECTION_LOST`). The `delivery` field is gone: it reported a distinction the client could not actually observe.

Every wire-layer failure closes the client — a lost connection, an unreadable reply, a reply that answers another message, or a send that times out. MLLP is lockstep, so after any of those the client can no longer tell which reply answers which message. Construct a new client to carry on.

**Also breaking, vs 0.17.x:** `send()` connects on first use, so `connect()` is optional (`NOT_CONNECTED` and `ALREADY_CONNECTED` are gone). Option validation throws `MllpInvalidOptionError` rather than a platform `RangeError`. An acknowledgment must echo MSA-2: a reply with an empty MSA-2 cannot be matched to a message and is `INVALID_RESPONSE`, where the previous client accepted it.
