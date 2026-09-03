# @glion/mllp-client

## 0.18.0

### Minor Changes

- 7715edf: Rebuild the client as a lockstep MLLP client: one connection, one message on the wire at a time, and a small error hierarchy that says what happened and whether the message may have been received.

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

- 5d81ea0: Add `@glion/util-charset` and decode inbound HL7v2 wire bytes through it, so a non-UTF-8 feed fails loudly instead of being silently corrupted to U+FFFD (#659).
  - Add `@glion/util-charset` with `decodeBytes(bytes)` and `encodeBytes(text)` for UTF-8 — decoding is fatal and strips a leading UTF-8 BOM
  - Add the `CharsetError` class (carrying `code: "INCOMPATIBLE_CHARSET"`), thrown by `decodeBytes` on a non-UTF-8 byte-order mark or otherwise-invalid UTF-8
  - Change the MLLP server to decode payloads via `decodeBytes`; a non-UTF-8 message now surfaces through `onError` as `MllpServerError` (`code` `INCOMPATIBLE_CHARSET`) instead of being decoded to U+FFFD and acknowledged as valid. The codec's `CharsetError` is kept on `cause`, never leaked to consumers
  - Change the MLLP client to decode ACKs via `decodeBytes`; a non-UTF-8 ACK now rejects with `MllpErrorCode.INVALID_RESPONSE`, with the `CharsetError` on `cause`
  - Add `MllpServerErrorCode.INCOMPATIBLE_CHARSET`. Consumers branch on each package's own error vocabulary (`MllpServerError`/`MllpClientError`) and never import `@glion/util-charset`

### Patch Changes

- Updated dependencies [ee6738b]
- Updated dependencies [64d78d6]
- Updated dependencies [e260ee4]
- Updated dependencies [7715edf]
- Updated dependencies [5d81ea0]
  - @glion/ack@0.18.0
  - @glion/mllp-codec@0.18.0
  - @glion/parser@0.18.0
  - @glion/util-charset@0.18.0
  - @glion/util-query@0.18.0
  - @glion/ast@0.18.0
  - @glion/to-hl7v2@0.18.0

## 0.17.0

### Minor Changes

- 5d65e92: Concurrent `send()` calls now queue in FIFO order and run one at a time instead of throwing `CONCURRENT_SEND` (the code is removed). Adds a `queueDepth` getter; the per-send timeout spans the queue wait, and a connection drop rejects the in-flight send (`DROPPED`) and every queued send (`CLOSED`).
- 58de708: New persistent, single-flight MLLP client for HL7v2. One long-lived connection per instance (`connect()` / `send()` / `close()`), MSA-2↔MSH-10 ACK correlation, and throw-on-NAK via the `@glion/ack` `AckException` family. Client and transport failures surface as a single `MllpClientError` discriminated by `code`. Ships a Node runtime adapter at `@glion/mllp-client/node`.

### Patch Changes

- b3a1921: `connect()` on a closed or closing client now throws `CLOSED` with an actionable message ("construct a new MllpClient") instead of the misleading `ALREADY_CONNECTED`. `ALREADY_CONNECTED` is reserved for the live states (`connecting` / `ready` / `sending`), where the connection can be reused.
- c09d415: Extract the request control ID (MSH-10) via the parser instead of a hand-rolled byte scan, and document the "parsed tree for logic, caller's bytes on the wire" contract for `send()` (a `string`/`Uint8Array` is framed verbatim; a `Root` is serialized with `@glion/to-hl7v2`).
- Updated dependencies [58de708]
- Updated dependencies [58de708]
  - @glion/ack@0.17.0
  - @glion/mllp-transport@0.17.0
  - @glion/ast@0.17.0
  - @glion/parser@0.17.0
  - @glion/to-hl7v2@0.17.0
  - @glion/util-query@0.17.0
