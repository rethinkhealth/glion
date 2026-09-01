# @glion/mllp-client

Persistent, single-flight MLLP client for HL7v2.

## What it does

`@glion/mllp-client` opens one long-lived MLLP/TCP connection and sends HL7v2 messages over it, one in flight at a time. `send()` accepts a `string` or a parsed `Root` AST. The AST is the first-class currency: every input is parsed to a tree and re-serialized to **canonical** HL7v2 for the wire — this is an _originating / cleaning_ client, not a byte-exact relay. Raw bytes are not accepted: decode them to text at your I/O boundary (where charset / MSH-18 knowledge lives) and pass the `string`. Cleaning is syntactic only (line endings normalized to CR, trailing empty fields/segments trimmed); escape sequences, Z-segments, repetitions, and components are preserved. The same parse drives MSH-10 correlation. Each `send()` waits for the remote system's ACK, verifies the MSA-2 correlation ID against the request's MSH-10, and resolves with a structured response. Application/commit accept codes (`AA`/`CA`) resolve; reject codes (`AE`/`AR`/`CE`/`CR`) throw the matching `@glion/ack` `AckException` (`AckApplicationError`, `AckApplicationReject`, `AckCommitError`, `AckCommitReject`).

The client is one class managing one socket lifecycle: `connect()` initializes, `send()` uses, `close()` tears down. One send is on the wire at a time; a concurrent `send()` while one is in flight rejects with `ALREADY_SENDING` (a FIFO send queue is deferred to a later version). The wire transport is supplied by a runtime adapter — the Node adapter ships at `@glion/mllp-client/node`. A remote system drop, write failure, or decoder framing error is terminal: the connection moves to `closed` and the instance is spent. Reconnect is deferred to a later version.

## Install

```bash
npm install @glion/mllp-client
```

### Package exports

| Subpath                   | Description                                       |
| ------------------------- | ------------------------------------------------- |
| `@glion/mllp-client`      | `MllpClient`, response/error types, error codes   |
| `@glion/mllp-client/node` | `connectNode` — Node `net.Socket` runtime adapter |

## Use

```ts
import { MllpClient } from "@glion/mllp-client";
import { connectNode } from "@glion/mllp-client/node";

const client = new MllpClient({
  host: "hl7.example.org",
  port: 2575,
  connect: connectNode,
});

await client.connect();

const message = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20240101120000||ADT^A01^ADT_A01|MSG00001|P|2.5",
  "PID|1||12345^^^MRN||Doe^John",
].join("\r");

const ack = await client.send(message);
// ack.code is "AA" or "CA". A NAK throws an @glion/ack AckException.

await client.close();
```

A remote system NAK (`AE` / `AR` / `CE` / `CR`) is thrown as an `@glion/ack` `AckException`, imported from `@glion/ack` (not this package) — the same typed exception the server raises:

```ts
import { AckException } from "@glion/ack";

try {
  const ack = await client.send(message);
  // ack.code is "AA" or "CA".
} catch (error) {
  if (error instanceof AckException) {
    // The remote system rejected the message — error.code is AE / AR / CE / CR.
  }
}
```

`MllpClient` implements `Symbol.asyncDispose`, so an `await using` binding closes the connection on scope exit:

```ts
await using client = new MllpClient({ host, port, connect: connectNode });
await client.connect();
await client.send(message);
// client.close() runs automatically here.
```

## API

### `new MllpClient(options)`

| Option             | Type            | Default    | Description                                                        |
| ------------------ | --------------- | ---------- | ------------------------------------------------------------------ |
| `host`             | `string`        | —          | Target host. Required.                                             |
| `port`             | `number`        | —          | Target port. Required.                                             |
| `connect`          | `MllpConnector` | —          | Runtime adapter that opens the wire, e.g. `connectNode`. Required. |
| `connectTimeoutMs` | `number`        | `30000`    | Deadline for `connect()`.                                          |
| `sendTimeoutMs`    | `number`        | `30000`    | Default per-send deadline. A per-call `timeoutMs` overrides it.    |
| `maxBufferedBytes` | `number`        | `16777216` | Cap on bytes buffered while decoding inbound ACK frames (16 MiB).  |

### Getters

| Getter             | Type              | Description                                                        |
| ------------------ | ----------------- | ------------------------------------------------------------------ |
| `client.host`      | `string`          | Configured target host.                                            |
| `client.port`      | `number`          | Configured target port.                                            |
| `client.state`     | `MllpClientState` | The connection phase: `idle`, `connecting`, `connected`, `closed`. |
| `client.connected` | `boolean`         | `true` while the wire is up (state is `connected`).                |

### `client.connect(): Promise<void>`

Opens the wire through the runtime adapter and starts the read loop. Idempotent: while `connecting` it returns the same in-flight attempt — one connection attempt per instance, every caller sees its outcome — and when already `connected` it resolves immediately. A hung connect is bounded by `connectTimeoutMs`; cancel a connecting client with `close()` (every joined caller then rejects with `CONNECT_ABORTED`).

**Throws**

All are an `MllpClientError`; branch on `code`:

- `CLOSED` — the instance is `closed`; construct a new instance.
- `CONNECT_FAILED` — the adapter rejected (the underlying error is on `cause`).
- `CONNECT_TIMEOUT` — the adapter exceeded `connectTimeoutMs` (`timeoutMs` is set).
- `CONNECT_ABORTED` — `close()` interrupted the connect.

### `client.send(message, options?): Promise<MllpClientResponse>`

Accepts a `string` or a `Root` (`SendInput`) — raw bytes are not accepted; decode them to text at your I/O boundary (where charset / MSH-18 knowledge lives) and pass the `string`. Both inputs are parsed to a tree and re-serialized to **canonical** HL7v2 for the wire (a `string` is parsed; a `Root` is used directly), and the same tree yields the MSH-10 correlation ID. The whole outbound chain — parse → serialize → encode → frame → correlate — is one named boundary (`prepareOutbound`) that either returns a sendable message or throws with nothing written. The wire bytes are the cleaned form, not a byte-exact echo of the input — line endings normalize to CR and trailing empty fields/segments are trimmed, while escape sequences and structure are preserved. (Known limitations: trailing-empty trimming is not idempotent; a `Root` that was escape-_decoded_ upstream must not be passed in, as it would re-serialize the decoded literals.) `options.timeoutMs` overrides the default send deadline, which covers the whole exchange — writing the message and waiting for its ACK. There is no per-send cancellation signal — `close()` rejects an in-flight send. One send is on the wire at a time; a concurrent `send()` while one is in flight rejects with `ALREADY_SENDING`.

**Throws**

- `AckException` (from `@glion/ack`) — the remote system returned a NAK (`AE`/`AR`/`CE`/`CR`). The concrete subclass encodes the code (`AckApplicationError` = AE, `AckApplicationReject` = AR, `AckCommitError` = CE, `AckCommitReject` = CR); it carries `code`, `errorCode` / `severity` (ERR-3 / ERR-4), `controlId`, and `text` (MSA-3 — the remote system's own diagnostic). Exceptions deliberately do not carry the full ACK payload; the accepted-response type (`MllpClientResponse`) is where `raw` and `tree` live.
- otherwise an `MllpClientError`; branch on `code`:
  - `INVALID_MESSAGE` — the message cannot be sent as-is: it has no MSH-10 control ID (so its acknowledgment could never be correlated), or its serialized text contains an MLLP reserved character (VT or FS — CR is allowed as the segment terminator; the `MllpCodecError` is on `cause`). Nothing was written; fix the message and send again.
  - `SEND_TIMEOUT` — no ACK arrived within the deadline (which covers the write too, so a remote system that stops reading cannot park a send forever). The connection is closed: a late ACK could never be matched safely. Resend on a new client, only when safe to repeat.
  - `ALREADY_SENDING` — another send is already on the wire (the client is single-flight and does not queue concurrent sends yet; await the in-flight send first).
  - `DROPPED` — the connection ended (remote system drop, write failure, decoder framing error, or unsolicited-frame flood). Terminal.
  - `NOT_CONNECTED` / `CLOSED` — the client is not connected, or has been closed (the in-flight send rejects).
  - `INVALID_RESPONSE` — the remote system replied, but the reply was not a usable acknowledgment of the message sent: undecodable bytes (non-UTF-8 — a Latin-1 / Windows-1252 remote system ACK trips this, with the charset error on `cause`), no / a non-standard MSA-1 acknowledgment code, or an MSA-2 that doesn't match the request's MSH-10. The specific reason is in `message`. The connection closes: an uninterpretable reply means acknowledgment correlation on this wire can no longer be trusted.

### `client.close(): Promise<void>`

Tears the connection down. Idempotent: resolves from any state and never rejects. An in-flight `send()` rejects with `MllpClientError` — `CLOSED` while waiting for the ACK, or `DROPPED` when the close lands mid-write.

### `client[Symbol.asyncDispose](): Promise<void>`

Calls `close()`. Enables `await using`.

### `MllpClientResponse`

| Field        | Type             | Description                                                               |
| ------------ | ---------------- | ------------------------------------------------------------------------- |
| `code`       | `AckSuccessCode` | MSA-1; always `AA` or `CA` (a NAK throws an `@glion/ack` `AckException`). |
| `controlId`  | `string`         | MSA-2 echoed by the remote system; `""` when the remote system omits it.  |
| `tree`       | `Root`           | Parsed AST of the ACK, for arbitrary field access via `value()`.          |
| `raw`        | `string`         | De-framed ACK payload as decoded text (UTF-8).                            |
| `timestamp`  | `Date`           | Wall-clock instant the ACK finished arriving.                             |
| `durationMs` | `number`         | Wire-level round-trip, measured monotonically.                            |

### Errors

Every error the client itself raises **is** an `MllpClientError`, carrying a `code` from `MllpErrorCode` — branch on `code`; a `switch` on it never needs to inspect client state. The human-readable detail is in `message`, and any wrapped underlying failure (e.g. the charset error behind an `INVALID_RESPONSE`) is on the standard `cause`. A NAK is the exception: `send()` throws an `@glion/ack` `AckException` — the same typed exception the server builds — imported from `@glion/ack`, not from this package.

| Class                         | Code(s) / notes                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MllpClientError`             | `ALREADY_SENDING`, `CLOSED`, `CONNECT_ABORTED`, `CONNECT_FAILED`, `CONNECT_TIMEOUT`, `DROPPED`, `INVALID_MESSAGE`, `INVALID_RESPONSE`, `NOT_CONNECTED`, `SEND_TIMEOUT` |
| `AckException` (`@glion/ack`) | NAK — `AckApplicationError` (AE) / `AckApplicationReject` (AR) / `AckCommitError` (CE) / `AckCommitReject` (CR)                                                        |

## Single-flight and lifecycle

One send is on the wire at a time. A concurrent `send()` while one is in flight rejects with `ALREADY_SENDING` — a FIFO send queue that would let concurrent calls run one after another is deferred to a later version. Each send's `timeoutMs` deadline clocks the whole exchange (write + ACK wait); there is no caller cancellation signal.

A send timeout closes the connection. After a timeout, a late acknowledgment could never be matched safely — one transient remote slowdown would otherwise leave every later send answering the wrong ACK — so the client recycles the wire the way most MLLP implementations do: the timed-out send rejects with `SEND_TIMEOUT`, later calls see `CLOSED`, and the late ACK lands on a dead connection. An uninterpretable reply (`INVALID_RESPONSE`) closes the connection for the same reason: a stray or unmatched frame consumed as the next send's acknowledgment would desynchronize every send after it.

A stream-level failure is terminal. A remote system drop, a write failure, a decoder framing error, or a flood of unsolicited frames moves the client to `closed`; the in-flight send rejects (`DROPPED`), and once closed both `send()` and `connect()` throw `CLOSED`. Recovery is a new instance — automatic reconnect is configured at construction in a later version, never as a `connect()` behaviour.

## Runtime adapters

A `MllpConnector` opens the wire and returns an `MllpDuplex`:

```ts
type MllpConnector = (opts: {
  host: string;
  port: number;
  signal: AbortSignal;
}) => Promise<MllpDuplex>;
```

`connectNode` (from `@glion/mllp-client/node`) wraps a Node `net.Socket`: `setNoDelay(true)`, TCP keepalive after 30 s idle, and a graceful close (FIN, a 1 s grace window, then `destroy()`). An adapter MUST honour `signal`, and its `MllpDuplex.close()` MUST resolve idempotently while `closed` resolves on either-side teardown.

## Part of Glion

`@glion/mllp-client` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
