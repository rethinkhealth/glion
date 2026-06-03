# @glion/mllp-client

Persistent, single-flight MLLP client for HL7v2.

## What it does

`@glion/mllp-client` opens one long-lived MLLP/TCP connection and sends HL7v2 messages over it, one in flight at a time. `send()` accepts a `string` or a parsed `Root` AST. The AST is the first-class currency: every input is parsed to a tree and re-serialized to **canonical** HL7v2 for the wire — this is an _originating / cleaning_ client, not a byte-exact relay. Raw bytes are not accepted: decode them to text at your I/O boundary (where charset / MSH-18 knowledge lives) and pass the `string`. Cleaning is syntactic only (line endings normalized to CR, trailing empty fields/segments trimmed); escape sequences, Z-segments, repetitions, and components are preserved. The same parse drives MSH-10 correlation. Each `send()` waits for the peer's ACK, verifies the MSA-2 correlation ID against the request's MSH-10, and resolves with a structured response. Application/commit accept codes (`AA`/`CA`) resolve; reject codes (`AE`/`AR`/`CE`/`CR`) throw the matching `@glion/ack` `AckException` (`AckApplicationError`, `AckApplicationReject`, `AckCommitError`, `AckCommitReject`).

The client is one class managing one socket lifecycle: `connect()` initializes, `send()` uses, `close()` tears down. One send is on the wire at a time; a concurrent `send()` while one is in flight rejects with `SEND_IN_PROGRESS` (a FIFO send queue is deferred to a later version). The wire transport is supplied by a runtime adapter — the Node adapter ships at `@glion/mllp-client/node`. A peer drop, write failure, or decoder framing error is terminal: the connection moves to `closed` and the instance is spent. Reconnect is deferred to a later version.

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

A peer NAK (`AE` / `AR` / `CE` / `CR`) is thrown as an `@glion/ack` `AckException`, imported from `@glion/ack` (not this package) — the same typed exception the server raises:

```ts
import { AckException } from "@glion/ack";

try {
  const ack = await client.send(message);
  // ack.code is "AA" or "CA".
} catch (error) {
  if (error instanceof AckException) {
    // Peer rejected the message — error.code is AE / AR / CE / CR.
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

| Getter             | Type              | Description                                                                                                  |
| ------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `client.host`      | `string`          | Configured target host.                                                                                      |
| `client.port`      | `number`          | Configured target port.                                                                                      |
| `client.state`     | `MllpClientState` | The connection phase: `idle`, `connecting`, `connected`, `closed` (plus `backingOff` once retry is enabled). |
| `client.connected` | `boolean`         | `true` while the wire is up (state is `connected`).                                                          |

### `client.connect(): Promise<void>`

Opens the wire through the runtime adapter and starts the read loop. A hung dial is bounded by `connectTimeoutMs`; cancel a connecting client with `close()`. Single-shot: each instance manages one connection lifecycle.

**Throws**

All are an `MllpClientError`; branch on `code`:

- `CLOSED` — the instance is `closed`; construct a new instance.
- `ALREADY_CONNECTED` — called while `connecting` or `connected` (the connection is live; reuse it).
- `CONNECT_FAILED` — the adapter rejected (the underlying error is on `cause`).
- `CONNECT_TIMEOUT` — the adapter exceeded `connectTimeoutMs` (`timeoutMs` is set).
- `CONNECT_ABORTED` — `close()` interrupted the connect.

### `client.send(message, options?): Promise<MllpClientResponse>`

Accepts a `string` or a `Root` (`SendInput`) — raw bytes are not accepted; decode them to text at your I/O boundary (where charset / MSH-18 knowledge lives) and pass the `string`. Both inputs are parsed to a tree and re-serialized to **canonical** HL7v2 for the wire (a `string` is parsed; a `Root` is used directly), and the same tree yields the MSH-10 correlation ID. The wire bytes are the cleaned form, not a byte-exact echo of the input — line endings normalize to CR and trailing empty fields/segments are trimmed, while escape sequences and structure are preserved. (Known limitations: trailing-empty trimming is not idempotent; a `Root` that was escape-_decoded_ upstream must not be passed in, as it would re-serialize the decoded literals.) `options.timeoutMs` overrides the default ACK-wait deadline. There is no per-send cancellation signal — `close()` rejects an in-flight send. One send is on the wire at a time; a concurrent `send()` while one is in flight rejects with `SEND_IN_PROGRESS`.

**Throws**

- `AckException` (from `@glion/ack`) — the peer returned a NAK (`AE`/`AR`/`CE`/`CR`). The concrete subclass encodes the code (`AckApplicationError` = AE, `AckApplicationReject` = AR, `AckCommitError` = CE, `AckCommitReject` = CR); it carries `code`, `errorCode` / `severity` (ERR-3 / ERR-4), `controlId`, `raw`, and the parsed `tree`.
- `FramingError` (from `@glion/mllp-transport`) — the message contains an embedded MLLP framing byte (VT or FS) that cannot be framed (thrown before any state change). CR is allowed — it is the HL7v2 segment terminator.
- otherwise an `MllpClientError`; branch on `code`:
  - `CORRELATION_MISMATCH` — both the request's MSH-10 and the response's MSA-2 are non-empty and differ (carries `expected` / `actual` / `tree` / `raw`). If either is empty, correlation is skipped.
  - `SEND_TIMEOUT` — no ACK arrived within the deadline (`timeoutMs` is set).
  - `SEND_IN_PROGRESS` — another send is already on the wire (the client is single-flight and does not queue concurrent sends yet; await the in-flight send first).
  - `DROPPED` — the connection ended; `reason` is one of `peer-drop`, `write-failed`, `framing-error`, `frame-queue-overflow`. Terminal.
  - `NOT_CONNECTED` / `CLOSED` — the client is not connected, or has been closed (the in-flight send rejects).
  - `PARSE_FAILED` — the peer's ACK is not parseable HL7v2, or is not valid UTF-8 (a Latin-1 / Windows-1252 peer ACK trips this; the client decodes ACKs as strict UTF-8).
  - `UNKNOWN_ACK_CODE` — the ACK carries a non-standard MSA-1.

### `client.close(): Promise<void>`

Tears the connection down. Idempotent: resolves from any state and never rejects. An in-flight `send()` rejects with `MllpClientError` (`CLOSED`).

### `client[Symbol.asyncDispose](): Promise<void>`

Calls `close()`. Enables `await using`.

### `MllpClientResponse`

| Field        | Type             | Description                                                               |
| ------------ | ---------------- | ------------------------------------------------------------------------- |
| `code`       | `AckSuccessCode` | MSA-1; always `AA` or `CA` (a NAK throws an `@glion/ack` `AckException`). |
| `controlId`  | `string`         | MSA-2 echoed by the peer; `""` when the peer omits it.                    |
| `tree`       | `Root`           | Parsed AST of the ACK, for arbitrary field access via `value()`.          |
| `raw`        | `string`         | De-framed ACK payload as decoded text (UTF-8).                            |
| `timestamp`  | `Date`           | Wall-clock instant the ACK finished arriving.                             |
| `durationMs` | `number`         | Wire-level round-trip, measured monotonically.                            |

### Errors

Every error the client itself raises **is** an `MllpClientError`, carrying a `code` from `MllpErrorCode` — branch on `code`; a `switch` on it never needs to inspect client state. Code-specific detail rides on optional fields (`reason` for `DROPPED`, `timeoutMs` for the timeouts, `expected`/`actual`/`tree`/`raw` for `CORRELATION_MISMATCH`) with `cause` for any wrapped error. A NAK is the exception: `send()` throws an `@glion/ack` `AckException` — the same typed exception the server builds — imported from `@glion/ack`, not from this package.

| Class                         | Code(s) / notes                                                                                                                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MllpClientError`             | `ALREADY_CONNECTED`, `CLOSED`, `CONNECT_ABORTED`, `CONNECT_FAILED`, `CONNECT_TIMEOUT`, `CORRELATION_MISMATCH`, `DROPPED`, `NOT_CONNECTED`, `PARSE_FAILED`, `SEND_IN_PROGRESS`, `SEND_TIMEOUT`, `UNKNOWN_ACK_CODE` |
| `AckException` (`@glion/ack`) | NAK — `AckApplicationError` (AE) / `AckApplicationReject` (AR) / `AckCommitError` (CE) / `AckCommitReject` (CR)                                                                                                   |

## Single-flight and lifecycle

One send is on the wire at a time. A concurrent `send()` while one is in flight rejects with `SEND_IN_PROGRESS` — a FIFO send queue that would let concurrent calls run one after another is deferred to a later version. Each send's `timeoutMs` deadline is the ACK-wait clock; there is no caller cancellation signal.

The decoder buffer persists across sends, so a late ACK from a previously-timed-out request lands on the next `send()` and trips the correlation check (`CORRELATION_MISMATCH`) rather than being silently accepted.

A stream-level failure is terminal. A peer drop, a write failure, a decoder framing error, or a flood of unsolicited frames moves the client to `closed`; the in-flight send rejects (`DROPPED`), and once closed both `send()` and `connect()` throw `CLOSED`. Recovery is a new instance — automatic reconnect is configured at construction in a later version, never as a `connect()` behaviour.

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
