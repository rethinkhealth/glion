# @glion/mllp-client

## 0.32.0

### Minor Changes

- [#1148](https://github.com/rethinkhealth/glion/pull/1148) [`783eda5`](https://github.com/rethinkhealth/glion/commit/783eda533ea9d9b39df95d7dbfcd60495a4beb00) Thanks [@meleksomai](https://github.com/meleksomai)! - **Breaking:** `MllpClient.send()` writes the message with `toHl7v2`, each segment followed by its `terminator`, and changes nothing about it: a message read with `\n` or `\r\n` line breaks is sent with them. Apply `@glion/transform-segment-terminator` before sending to end every segment with `\r`.

  `glion send` reads a message with `@glion/parser` and `@glion/transform-segment-terminator`, so each segment is sent ending with `\r`, whatever line breaks the file holds.

### Patch Changes

- [#1138](https://github.com/rethinkhealth/glion/pull/1138) [`dcefdc9`](https://github.com/rethinkhealth/glion/commit/dcefdc9ff2af60dc18898f655405c42aae04cfd9) Thanks [@meleksomai](https://github.com/meleksomai)! - A message is sent with the segment terminator after its last segment, as HL7v2 Chapter 2 requires: the MLLP payload is `MSH|^~\&|…\rPID|1\r`, then the `<FS><CR>` trailer.
- Updated dependencies [[`d697238`](https://github.com/rethinkhealth/glion/commit/d697238293eb59554cbe79695c1af882fc4fb9db), [`dcefdc9`](https://github.com/rethinkhealth/glion/commit/dcefdc9ff2af60dc18898f655405c42aae04cfd9), [`1149745`](https://github.com/rethinkhealth/glion/commit/114974584f3e71e4c3ffcf3014a7d4e815be57b7), [`783eda5`](https://github.com/rethinkhealth/glion/commit/783eda533ea9d9b39df95d7dbfcd60495a4beb00), [`783eda5`](https://github.com/rethinkhealth/glion/commit/783eda533ea9d9b39df95d7dbfcd60495a4beb00)]:
  - @glion/parser@0.32.0
  - @glion/ast@0.32.0
  - @glion/to-hl7v2@0.32.0
  - @glion/util-query@0.32.0
  - @glion/ack@0.32.0
  - @glion/mllp-codec@0.32.0
  - @glion/util-charset@0.32.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @glion/ack@0.31.0
  - @glion/ast@0.31.0
  - @glion/mllp-codec@0.31.0
  - @glion/parser@0.31.0
  - @glion/to-hl7v2@0.31.0
  - @glion/util-charset@0.31.0
  - @glion/util-query@0.31.0

## 0.30.0

### Minor Changes

- [#1062](https://github.com/rethinkhealth/glion/pull/1062) [`97513a4`](https://github.com/rethinkhealth/glion/commit/97513a48c1c918c9e21774a0825418f64f02782d) Thanks [@meleksomai](https://github.com/meleksomai)! - Breaking: the runtime adapters take a function that opens the connection, and pass the runtime's own options through unchanged ([#814](https://github.com/rethinkhealth/glion/issues/814)).

  - `nodeSocket(dial, { gracefulCloseMs })` calls `dial` for a fresh `net.Socket` or `tls.TLSSocket` on every connect, so every `net.connect()` and `tls.connect()` option applies, `minVersion`, `ciphers`, and `checkServerIdentity` among them. `host`, `port`, `tls`, and `keepAliveIdleMs` are gone, with `NodeTlsOptions` and `DEFAULT_KEEPALIVE_IDLE_MS`.
  - The adapter no longer sets `TCP_NODELAY` or keepalive, nor sends `host` as the TLS server name. Call `setNoDelay(true)` and `setKeepAlive(true, 30_000)` on the socket `dial` returns, and pass `servername`, to keep them.
  - `workersSocket(dial)` calls `dial` for a fresh socket from `connect()` in `cloudflare:sockets`, or from a binding's `connect()`. `WorkersSocketOptions` is gone.
  - `dial` returns the socket itself; a `dial` that returns a promise fails the connect with a `TypeError` on `cause`, after its socket is ended. Both adapters throw `MllpInvalidOptionError` when `dial` is not a function, so a call in the old shape (`nodeSocket({ host, port })`) fails at once.

  ```ts
  // Before
  nodeSocket({ host: "hl7.example.org", port: 2575, tls: { ca } });
  // After
  nodeSocket(() =>
    tls
      .connect({
        host: "hl7.example.org",
        port: 2575,
        ca,
        servername: "hl7.example.org",
      })
      .setNoDelay(true)
      .setKeepAlive(true, 30_000)
  );
  ```

### Patch Changes

- Updated dependencies [[`8b09ba9`](https://github.com/rethinkhealth/glion/commit/8b09ba9fe76167f23b99f28f22e2c6fd5d246da1), [`d769436`](https://github.com/rethinkhealth/glion/commit/d7694361597b574af2203052f80c029a55484cb1), [`28b61ea`](https://github.com/rethinkhealth/glion/commit/28b61ea1b40ebfb3ed5e025684f200736479852e)]:
  - @glion/parser@0.30.0
  - @glion/to-hl7v2@0.30.0
  - @glion/util-query@0.30.0
  - @glion/ack@0.30.0
  - @glion/ast@0.30.0
  - @glion/mllp-codec@0.30.0
  - @glion/util-charset@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies [[`c76a45d`](https://github.com/rethinkhealth/glion/commit/c76a45d2c9345db5ad6550f74b4fdc7546d2fd56), [`e2fb937`](https://github.com/rethinkhealth/glion/commit/e2fb9376aaba5e132a20091cfac91bc8b4f88ba9)]:
  - @glion/to-hl7v2@0.29.0
  - @glion/parser@0.29.0
  - @glion/util-query@0.29.0
  - @glion/ack@0.29.0
  - @glion/ast@0.29.0
  - @glion/mllp-codec@0.29.0
  - @glion/util-charset@0.29.0

## 0.28.0

### Minor Changes

- [#1001](https://github.com/rethinkhealth/glion/pull/1001) [`ccd49ff`](https://github.com/rethinkhealth/glion/commit/ccd49ff4fb7e82a628ef05ac905110a9c9e173ad) Thanks [@meleksomai](https://github.com/meleksomai)! - Breaking: decode HL7v2 escape sequences while parsing and encode them while serializing, so a subcomponent `value` is always the content and a parsed message writes back as the same text.

  - `hl7v2Parser` decodes `\F\`, `\S\`, `\R\`, `\T\`, `\E\`, `\.br\`, and `\Xdd\` in every value as it tokenizes, leaving MSH-2 as it is; pass `decodeEscapes: false` to keep the wire form in the tree
  - A formatting command (`\H\`, `\N\`, `\.sp 2\`, …), a locally defined sequence (`\Z…\`), and a character set switch (`\Cxxyy\`, `\Mxxyyzz\`) stay in the value as written and are written back as they are; `hl7v2DecodeEscapes` no longer removes `\H\` and `\N\`
  - `hl7v2ToHl7v2` and `toHl7v2` write delimiters, the escape character, the segment delimiter, and other control characters in a value as escape sequences, leaving MSH-1 and MSH-2 as they are; pass `encodeEscapes: false` to write values as they are
  - `parseHL7v2` from `@glion/hl7v2` no longer runs `hl7v2DecodeEscapes`; its output is unchanged
  - Add `decodeEscapes(value, delimiters)` and `encodeEscapes(value, delimiters)` to `@glion/utils`
  - `hl7v2DecodeEscapes` and `hl7v2EncodeEscapes` are for trees handled with those options off; a parsed tree must not be decoded again
  - `hl7v2EncodeEscapes` now writes a control character other than the segment delimiter as `\Xdd\`
  - `hl7v2DecodeEscapes` and `hl7v2EncodeEscapes` leave a subcomponent without a value as it is
  - `MllpClient` and `glion send` send a message whose value holds a control character, written as `\Xdd\`, instead of rejecting it with `INVALID_MESSAGE`
  - The bytes of a `\Xdd…\` are decoded as UTF-8; a sequence whose bytes are not UTF-8, or that has an odd number of digits, stays as written

### Patch Changes

- Updated dependencies [[`ccd49ff`](https://github.com/rethinkhealth/glion/commit/ccd49ff4fb7e82a628ef05ac905110a9c9e173ad)]:
  - @glion/parser@0.28.0
  - @glion/to-hl7v2@0.28.0
  - @glion/util-query@0.28.0
  - @glion/ack@0.28.0
  - @glion/ast@0.28.0
  - @glion/mllp-codec@0.28.0
  - @glion/util-charset@0.28.0

## 0.27.1

### Patch Changes

- Updated dependencies []:
  - @glion/ack@0.27.1
  - @glion/ast@0.27.1
  - @glion/mllp-codec@0.27.1
  - @glion/parser@0.27.1
  - @glion/to-hl7v2@0.27.1
  - @glion/util-charset@0.27.1
  - @glion/util-query@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies [[`d702f6a`](https://github.com/rethinkhealth/glion/commit/d702f6a31ff95af55b3850e18d1d3f13f3accce7), [`799a57c`](https://github.com/rethinkhealth/glion/commit/799a57c8dd6bab65c3c655cef2515be4c0eb45d0), [`3dfa36e`](https://github.com/rethinkhealth/glion/commit/3dfa36e5ba03ad7bfe4ce037cc1bd12c53d42a1d), [`ac05055`](https://github.com/rethinkhealth/glion/commit/ac05055ab3348054d3c98429e53e7c105a82c02f), [`58c6ab6`](https://github.com/rethinkhealth/glion/commit/58c6ab6b4052d68c3361a9aa56c4057f7b034728), [`34d8e21`](https://github.com/rethinkhealth/glion/commit/34d8e217a9655cee2fdf42202ed58168c3ed72ed)]:
  - @glion/util-query@0.27.0
  - @glion/to-hl7v2@0.27.0
  - @glion/ack@0.27.0
  - @glion/ast@0.27.0
  - @glion/mllp-codec@0.27.0
  - @glion/parser@0.27.0
  - @glion/util-charset@0.27.0

## 0.26.0

### Patch Changes

- Updated dependencies []:
  - @glion/ack@0.26.0
  - @glion/ast@0.26.0
  - @glion/mllp-codec@0.26.0
  - @glion/parser@0.26.0
  - @glion/to-hl7v2@0.26.0
  - @glion/util-charset@0.26.0
  - @glion/util-query@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies []:
  - @glion/ack@0.25.0
  - @glion/ast@0.25.0
  - @glion/mllp-codec@0.25.0
  - @glion/parser@0.25.0
  - @glion/to-hl7v2@0.25.0
  - @glion/util-charset@0.25.0
  - @glion/util-query@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies []:
  - @glion/parser@0.24.0
  - @glion/to-hl7v2@0.24.0
  - @glion/util-query@0.24.0
  - @glion/ack@0.24.0
  - @glion/ast@0.24.0
  - @glion/mllp-codec@0.24.0
  - @glion/util-charset@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies []:
  - @glion/ack@0.23.0
  - @glion/ast@0.23.0
  - @glion/mllp-codec@0.23.0
  - @glion/parser@0.23.0
  - @glion/to-hl7v2@0.23.0
  - @glion/util-charset@0.23.0
  - @glion/util-query@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies [[`93dbb80`](https://github.com/rethinkhealth/glion/commit/93dbb8053acfdf46f72dba2932950cf260e75ab7)]:
  - @glion/ast@0.22.0
  - @glion/util-query@0.22.0
  - @glion/ack@0.22.0
  - @glion/parser@0.22.0
  - @glion/to-hl7v2@0.22.0
  - @glion/mllp-codec@0.22.0
  - @glion/util-charset@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [[`e38396e`](https://github.com/rethinkhealth/glion/commit/e38396e9962e203986aa27fc205c3f5bf992d153)]:
  - @glion/util-query@0.21.0
  - @glion/to-hl7v2@0.21.0
  - @glion/ack@0.21.0
  - @glion/ast@0.21.0
  - @glion/mllp-codec@0.21.0
  - @glion/parser@0.21.0
  - @glion/util-charset@0.21.0

## 0.20.0

### Minor Changes

- [#774](https://github.com/rethinkhealth/glion/pull/774) [`e3dad65`](https://github.com/rethinkhealth/glion/commit/e3dad65d4650ef175aeb87cd1c81d61ef7f10019) Thanks [@meleksomai](https://github.com/meleksomai)! - `send()` waits for the message in flight instead of refusing.

  A `send()` arriving while another message is on the wire now waits for its acknowledgment, then goes out. Sends leave in the order they were called, one at a time, so `Promise.allSettled` over a batch delivers it in order on one connection. The queue is in memory and has no bound; `timeoutMs` runs from the moment the write starts, not from the call. A send still waiting when `close()` or `destroy()` is called, or when a failure closes the client, rejects at once with `MllpClientClosedError` and `delivery: "not-sent"`, so nothing goes out behind a message whose delivery is unknown; one waiting behind a dial that fails rejects with the dial's error, as `connect()` does.

  `close()` called a second time while the first is waiting out the message on the wire no longer falls through to `destroy()` and aborts it with `SEND_ABORTED`; the message is acknowledged and both calls resolve once the connection is down. A `close()` or `destroy()` arriving during the teardown itself likewise resolves only once the connection is down, where it used to resolve at once. `destroy()` takes an optional `reason`, the failure the client then reports on `close` and on `cause`, as `net.Socket.destroy(error)` does; arriving during an ending already under way, it cuts the message in flight and joins that ending, recording `reason` when no failure is known yet. `close()` reports the failure of a message it was waiting out, rather than `null`, whether the failure landed before or after the call. A call cancelled by `destroy(reason)` while dialing, or arriving during its teardown, gets `CLOSED` with `reason` on `cause`. `client.state` reads `closing` for the whole of that teardown, whether `close()`, `destroy()`, or a failure started it, and `closed` only once the connection is down; the `close` event fires at that point. `MllpClientClosedError`'s message now says the client closed on a failure and points at `cause`, rather than naming a reconnect that may not have happened.

  `client.pending` reports how many sends wait their turn, the one in flight excluded.

  **Breaking:** `MllpAlreadySendingError` and `MllpErrorCode.ALREADY_SENDING` are removed. A `switch` over `MllpErrorCode` that listed the code loses that arm; a handler that awaited and resent on it can drop the loop.

- [#808](https://github.com/rethinkhealth/glion/pull/808) [`a0cc178`](https://github.com/rethinkhealth/glion/commit/a0cc178a0aed61d92b240c0e8af830e86db488d1) Thanks [@meleksomai](https://github.com/meleksomai)! - Add TLS to the runtime adapters.
  - `nodeSocket({ host, port, tls })` on Node.js, Bun, and Deno. `tls: true` verifies the receiver against the runtime's trusted CAs and sends `host` as the server name (SNI). An object passes `ca`, `cert`, `key`, `passphrase`, `pfx`, `servername`, and `rejectUnauthorized`, typed as `NodeTlsOptions`; `ca` replaces the trusted CAs.
  - `workersSocket({ host, port, tls })` on Cloudflare Workers. `tls` is a boolean; any other value throws `MllpInvalidOptionError`.
  - A failed handshake rejects with `CONNECTION_FAILED`, with the TLS error on `cause`.

- [#801](https://github.com/rethinkhealth/glion/pull/801) [`d716120`](https://github.com/rethinkhealth/glion/commit/d7161207ed85a57908f52318027967f5aaf2d9dd) Thanks [@meleksomai](https://github.com/meleksomai)! - Add the Cloudflare Workers runtime adapter `workersSocket` at `@glion/mllp-client/workers`.
  - Add `workersSocket({ host, port })`, a `MllpSocket` over `cloudflare:sockets`; plain TCP, TLS tracked in [#657](https://github.com/rethinkhealth/glion/issues/657)

### Patch Changes

- [#800](https://github.com/rethinkhealth/glion/pull/800) [`62963fe`](https://github.com/rethinkhealth/glion/commit/62963fe254e90d903795d30b418eb7b8d93d8d87) Thanks [@meleksomai](https://github.com/meleksomai)! - Support Bun and Deno through `nodeSocket`, verified by a conformance suite that runs the `MllpSocket` contract and the client's behaviour over a real socket unchanged on Node, Bun, and Deno.
  - Document Bun and Deno in the runtimes table; both use `@glion/mllp-client/node` through their `node:net` compatibility

- Updated dependencies [[`003907b`](https://github.com/rethinkhealth/glion/commit/003907bfe239970a5d333e47bc9d5e82ca750c51)]:
  - @glion/to-hl7v2@0.20.0
  - @glion/parser@0.20.0
  - @glion/ack@0.20.0
  - @glion/util-query@0.20.0
  - @glion/ast@0.20.0
  - @glion/mllp-codec@0.20.0
  - @glion/util-charset@0.20.0

## 0.19.0

### Minor Changes

- [#756](https://github.com/rethinkhealth/glion/pull/756) [`da56d71`](https://github.com/rethinkhealth/glion/commit/da56d710066a52aa22ff5a65a6e3135ebb7026c4) Thanks [@meleksomai](https://github.com/meleksomai)! - Dial again when a connection attempt fails.

  A connection that cannot be opened is dialed again under a new `reconnect` option: `attempts` (default 5, about 30 seconds of backoff in all) and `delay(attempt)` (default full-jitter backoff from 1 s, capped at 30 s). Once the policy gives up, the client closes with the last attempt's error. `reconnect: false` dials once. `close()` and `destroy()` stop the dialing at once.

  A lost connection still closes the client, and the message in flight is not sent again: its `send()` rejects with `CONNECTION_LOST`, `SEND_TIMEOUT`, or `INVALID_RESPONSE`. The `disconnect` event is removed; `close` now carries the failure the client closed on, or `null` when the owner closed it. The `MllpConnection` type is no longer exported.

  The errors are redesigned around one question, what became of the message: every `MllpClientError` carries `delivery`, `"not-sent"` or `"unknown"`. `CONNECT_FAILED` and `CONNECT_TIMEOUT` are renamed `CONNECTION_FAILED` and `CONNECTION_TIMEOUT` (classes `MllpConnectionFailedError`, `MllpConnectionTimeoutError`); a send cut off by `destroy()` now rejects with `SEND_ABORTED` (`MllpSendAbortedError`) rather than `CLOSED`; `MllpConnectionError` is a new abstract base for the four wire failures; `MllpConnectionLostError` no longer carries `controlId`. `MllpClientClosedError` gains `cause`: the last attempt's failure, when the client closed because the policy gave up.

### Patch Changes

- Updated dependencies []:
  - @glion/ack@0.19.0
  - @glion/ast@0.19.0
  - @glion/mllp-codec@0.19.0
  - @glion/parser@0.19.0
  - @glion/to-hl7v2@0.19.0
  - @glion/util-charset@0.19.0
  - @glion/util-query@0.19.0

## 0.18.0

### Minor Changes

- dca5259: **BREAKING:** Raise `engines.node` from `>=20` to `>=22` across all `@glion/*` packages and `create-glion`, and drop Node 20.x from the CI test matrix (#728).

  Node 20 reached end-of-life on 2026-04-30 and is no longer tested. The supported and tested runtimes are Node 22 and Node 24.

  Downstream impact: applications that pin Node 20 will need to upgrade to Node 22 or later. Node 22 is in Maintenance LTS until April 2027; Node 24 is the current Active LTS and the recommended target.

- 033cdb6: Rebuilds the client as a lockstep MLLP client: one socket to one remote system, one message on the wire at a time. `send()` writes the message, waits for the acknowledgment, checks that it answers this message, and resolves with it. There is no background reader and no queue. The lifecycle is one immutable phase object, replaced on every change, so a racing `close()` is detected rather than overwritten.

  **Breaking: the client takes a socket, not a host and port.** `MllpClientOptions.socket` is an `MllpSocket` — `connect(signal)` hands over the byte streams, `close()` ends them. The Node adapter is `nodeSocket({ host, port })` from `@glion/mllp-client/node`, with `gracefulCloseMs` and `keepAliveIdleMs` as options. A third-party runtime implements the same two methods.

  **Breaking: `send()` takes a parsed `Root`.** Text is parsed at the caller's boundary. The message must carry an MSH-10 control ID; one without it throws `MllpInvalidMessageError` before anything is written.

  **Breaking: a NAK is thrown, not returned.** `AE`, `AR`, `CE` and `CR` reject with the matching `@glion/ack` exception — the same types the server raises — and leave the connection open. `MllpClientResponse` is the accept case only, and reports `id` (the acknowledgment's own MSH-10) separately from `controlId` (MSA-2, the message it answers).

  **A reply is correlated before it is judged.** MSA-2 is read before MSA-1, so an accept or a NAK is only ever reported for the message it answers. A reply naming a different message fails with `MllpInvalidResponseError` whatever its MSA-1 says — previously a NAK skipped the correlation check entirely and was reported as the rejection of whichever message happened to be in flight.

  **`close()` and `destroy()` are now different verbs.** `close()` lets the message in flight finish and refuses new sends from the moment it is called; `destroy()` ends the connection at once and rejects whatever was in flight with `MllpClientClosedError`. Both resolve from any phase, never reject, and are idempotent. `client.state` gains `closing`.

  **Events.** `client.on(...)` / `off(...)` for `connect`, `disconnect` and `close`. `disconnect` carries the failure that ended the connection, or `null` when this process closed it.

  **Errors are one class per situation**, each with a fixed `code`, in an `errors/` folder of one file per class. `MllpDroppedError` is now `MllpConnectionLostError` (`CONNECTION_LOST`). The `delivery` field is gone: it reported a distinction the client could not actually observe.

  Every wire-layer failure closes the client — a lost connection, an unreadable reply, a reply that answers another message, or a send that times out. MLLP is lockstep, so after any of those the client can no longer tell which reply answers which message. Construct a new client to carry on.

  **Also breaking, vs 0.17.x:** `send()` connects on first use, so `connect()` is optional (`NOT_CONNECTED` and `ALREADY_CONNECTED` are gone). Option validation throws `MllpInvalidOptionError` rather than a platform `RangeError`. An acknowledgment must echo MSA-2: a reply with an empty MSA-2 cannot be matched to a message and is `INVALID_RESPONSE`, where the previous client accepted it.

- 5d81ea0: Add `@glion/util-charset` and decode inbound HL7v2 wire bytes through it, so a non-UTF-8 feed fails loudly instead of being silently corrupted to U+FFFD (#659).
  - Add `@glion/util-charset` with `decodeBytes(bytes)` and `encodeBytes(text)` for UTF-8 — decoding is fatal and strips a leading UTF-8 BOM
  - Add the `CharsetError` class (carrying `code: "INCOMPATIBLE_CHARSET"`), thrown by `decodeBytes` on a non-UTF-8 byte-order mark or otherwise-invalid UTF-8
  - Change the MLLP server to decode payloads via `decodeBytes`; a non-UTF-8 message now surfaces through `onError` as `MllpServerError` (`code` `INCOMPATIBLE_CHARSET`) instead of being decoded to U+FFFD and acknowledged as valid. The codec's `CharsetError` is kept on `cause`, never leaked to consumers
  - Change the MLLP client to decode ACKs via `decodeBytes`; a non-UTF-8 ACK now rejects with `MllpErrorCode.INVALID_RESPONSE`, with the `CharsetError` on `cause`
  - Add `MllpServerErrorCode.INCOMPATIBLE_CHARSET`. Consumers branch on each package's own error vocabulary (`MllpServerError`/`MllpClientError`) and never import `@glion/util-charset`

### Patch Changes

- Updated dependencies [ee6738b]
- Updated dependencies [033cdb6]
- Updated dependencies [dca5259]
- Updated dependencies [64d78d6]
- Updated dependencies [5f18700]
- Updated dependencies [e260ee4]
- Updated dependencies [7715edf]
- Updated dependencies [5d81ea0]
  - @glion/ack@0.18.0
  - @glion/ast@0.18.0
  - @glion/mllp-codec@0.18.0
  - @glion/parser@0.18.0
  - @glion/to-hl7v2@0.18.0
  - @glion/util-charset@0.18.0
  - @glion/util-query@0.18.0

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
