---
"@glion/mllp-client": minor
---

Rebuild the client as a lockstep MLLP client: one connection, one message on the wire at a time, and a small error hierarchy that says what happened and whether the message may have been received.

HL7v2 over MLLP is lockstep, so `send()` is one write followed by one read: it writes the message, waits for the next frame, checks that the frame acknowledges this message, and resolves with it. There is no background reader and no queue. Lifecycle state is one immutable phase object, replaced on every change, so a racing `close()` is detected rather than overwritten.

**API changes vs 0.17.x** (breaking; the package is 0.x):

- **`send()` connects on first use.** `connect()` is optional and remains for opening the connection ahead of time, for example to fail fast at startup. It is idempotent: a connected client resolves at once, and a call that arrives while an attempt is in flight waits for that attempt and shares its outcome. `NOT_CONNECTED` and `ALREADY_CONNECTED` are removed.
- **One error class per situation.** Every failure the client raises extends the abstract `MllpClientError`: `MllpInvalidOptionError`, `MllpAlreadySendingError`, `MllpClientClosedError`, `MllpInvalidMessageError`, `MllpConnectFailedError`, `MllpConnectTimeoutError`, `MllpConnectAbortedError`, `MllpSendTimeoutError`, `MllpDroppedError`, `MllpInvalidResponseError`. Each carries a fixed `code` of the same name for logs and `switch` statements, and typed fields where they matter (`controlId`, `timeoutMs`). Errors from the layers below never surface as their own type; they arrive on `cause`.
- **`delivery` on every error.** `not-sent` means nothing reached the wire and sending again is safe; `unknown` means the message may have been received and should be sent again only when it is safe to repeat. Connect, option, state, and message failures are `not-sent`; a send timeout and an unusable reply are `unknown`; a dropped connection and a `close()` that interrupts a send are `not-sent` when the write had not completed and `unknown` after.
- **An acknowledgment must echo MSA-2.** A reply with an empty MSA-2 cannot be matched to the message and is now `INVALID_RESPONSE`, where the previous client accepted it for older remote systems. Correlation is what keeps a lockstep client honest, so this is deliberate.
- **Option validation throws `MllpInvalidOptionError`** (`INVALID_OPTION`) instead of a platform `RangeError`, so everything the client raises is one hierarchy.
- **`MllpClientState` gains `sending`.** The phases are `idle | connecting | connected | sending | closed`; `client.connected` is true in both `connected` and `sending`.
- **`MllpClientResponse` is `{ code, tree, raw }`.** `controlId`, `timestamp`, and `durationMs` are removed: the control ID is the one you sent, and timing belongs to the caller.
- **The runtime contract is `MllpConnection` and `MllpConnector`** (previously `MllpDuplex`). A connection is a pair of byte streams and a bounded, idempotent `close()`; the connector opens one and honours its `signal`. The `closed` promise is removed, so a remote system that hangs up while the client is idle is noticed on the next `send()` (tracked in #690).
- **Unchanged from the previous rewrite:** `send(string | Root)` with the AST as the wire currency; single-flight with `ALREADY_SENDING`; a required MSH-10 (`INVALID_MESSAGE`); a send timeout and an unusable reply both close the connection, because a late or stray frame could otherwise be taken as a later message's acknowledgment; a NAK throws the matching `@glion/ack` exception with the connection left open.

Migration:

- Drop `connect()` calls you only made to satisfy the client, or keep them to fail fast; catch connect errors on the first `send()` if you did not.
- Replace `switch (error.code)` branches for `NOT_CONNECTED` with nothing; replace `instanceof MllpClientError` plus code checks with the specific class where that reads better.
- Decide resends on `error.delivery` rather than on the code.
- Replace `RangeError` handling around construction and `send()` options with `MllpInvalidOptionError`.
- Adapters: implement `MllpConnection` instead of `MllpDuplex`; drop the `closed` promise.
