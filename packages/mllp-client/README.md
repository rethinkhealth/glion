# @glion/mllp-client

A simple HL7v2 MLLP client for Node.js and Cloudflare Workers.

- 📦 **MLLP built in.** Framing, message boundaries and acknowledgment matching are handled. You send a parsed message and get one back.
- 🔄 **Predictable connection lifecycle.** Timeouts on connecting and on waiting for a reply, TCP keepalive by default, and explicit states you can read.
- ⚡ **Thin over TCP.** One socket, one message at a time. No queue, no worker threads, no polling.
- 🧯 **Errors you can act on.** Every failure carries a stable code and says whether the connection is still usable.
- 🧩 **Any transport.** TCP included. TLS, Cloudflare Workers or an in-memory socket plug in behind it.
- 🔤 **Typed end to end.** TypeScript throughout, with parsed HL7v2 going in and coming out.

> **Coming soon** — TLS and Cloudflare Workers adapters. Today the only bundled adapter is Node.js over TCP.

## Install

```bash
npm install @glion/mllp-client
```

Node.js 22 or later. ESM only.

## Use

### Send a message

```ts
import { parseHL7v2 } from "@glion/parser";
import { MllpClient } from "@glion/mllp-client";
import { nodeSocket } from "@glion/mllp-client/node";

await using client = new MllpClient({
  socket: nodeSocket({ host: "hl7.example.org", port: 2575 }),
});

const adt = parseHL7v2(
  [
    "MSH|^~\\&|SENDER|FAC|RECV|FAC|20260101120000||ADT^A01|MSG00001|P|2.5",
    "EVN|A01|20260101120000",
    "PID|1||12345^^^MRN||DOE^JOHN||19800101|M",
  ].join("\r")
);

const ack = await client.send(adt);
ack.code; //=> "AA" or "CA"
ack.raw; //=> the acknowledgment as text
ack.tree; //=> the acknowledgment as a tree
```

`send()` connects on first use, so `connect()` is optional. `await using` closes the client at the end of the block; without it, call `close()`.

### Handle a rejection

A NAK means the receiver read your message and refused it — a bad field, a patient it does not know, a message type it does not handle. `send()` throws, and the connection stays open for the next message.

```ts
import { AckException } from "@glion/ack";
import { MllpClientError } from "@glion/mllp-client";

try {
  await client.send(adt);
} catch (error) {
  if (error instanceof AckException) {
    error.code; //=> "AE", "AR", "CE", or "CR"
    error.text; //=> the receiver's reason, when it gave one
  } else if (error instanceof MllpClientError) {
    error.code; //=> e.g. "SEND_TIMEOUT" — see Errors
  }
}
```

### Connect at startup

`connect()` opens the connection without sending anything. Call it at startup to find out immediately that a host, port, or firewall is wrong, instead of on your first real message.

```ts
const client = new MllpClient({
  socket: nodeSocket({ host: "hl7.example.org", port: 2575 }),
});
await client.connect();
```

Calling it twice is safe. On a connected client it returns immediately; while a connection is still opening, it waits for that attempt and shares its result.

## Options

| Option             | Type         | Default  | Description                                                                                            |
| ------------------ | ------------ | -------- | ------------------------------------------------------------------------------------------------------ |
| `socket`           | `MllpSocket` | required | Runtime adapter, such as `nodeSocket({ host, port })`.                                                 |
| `connectTimeoutMs` | `number`     | `10000`  | Time allowed to open the connection. Exceeded: `MllpConnectTimeoutError`.                              |
| `sendTimeoutMs`    | `number`     | `30000`  | Time allowed from writing a message to receiving its acknowledgment. Exceeded: `MllpSendTimeoutError`. |
| `maxBufferedBytes` | `number`     | 16 MiB   | Largest reply the client buffers. Exceeded: `MllpInvalidResponseError`.                                |

`send(message, { timeoutMs })` overrides `sendTimeoutMs` for one message.

## API

### `new MllpClient(options)`

```ts
new MllpClient(options: MllpClientOptions): MllpClient
```

Creates a client for one remote system. Nothing is opened until the first `connect()` or `send()`.

**Parameters** — see [Options](#options).

**Throws** `MllpInvalidOptionError` when a timeout is not a positive number of milliseconds, or `maxBufferedBytes` is not a positive integer.

```ts
const client = new MllpClient({
  socket: nodeSocket({ host: "hl7.example.org", port: 2575 }),
  sendTimeoutMs: 10_000,
});
```

### `client.send(message, options?)`

```ts
send(message: Root, options?: { timeoutMs?: number }): Promise<MllpClientResponse>
```

Sends one message and resolves with the acknowledgment that answers it. Connects first if the client is not connected.

| Parameter           | Type     | Description                                              |
| ------------------- | -------- | -------------------------------------------------------- |
| `message`           | `Root`   | A parsed HL7v2 message. Must carry an MSH-10 control ID. |
| `options.timeoutMs` | `number` | Overrides `sendTimeoutMs` for this message only.         |

**Returns** an `MllpClientResponse`:

| Field       | Type             | Description                                         |
| ----------- | ---------------- | --------------------------------------------------- |
| `code`      | `AckSuccessCode` | MSA-1, `AA` or `CA`.                                |
| `controlId` | `string`         | MSA-2: the control ID of the message this answers.  |
| `id`        | `string`         | The acknowledgment's own MSH-10.                    |
| `text`      | `string?`        | MSA-3, the receiver's diagnostic, when it gave one. |
| `tree`      | `Root`           | The acknowledgment, parsed.                         |
| `raw`       | `string`         | The acknowledgment as text.                         |

**Throws**

- `AckException` — the receiver refused the message. The connection stays open.
- `MllpInvalidMessageError` — no MSH-10, or the message could not be serialized. Nothing was sent.
- `MllpInvalidOptionError` — `timeoutMs` is out of range. Nothing was sent.
- `MllpAlreadySendingError` — another send is in flight.
- `MllpClientClosedError` — the client is closed.
- `MllpConnectFailedError`, `MllpConnectTimeoutError` — the connection could not be opened.
- `MllpSendTimeoutError`, `MllpConnectionLostError`, `MllpInvalidResponseError` — the exchange failed. These close the connection; see [Errors](#errors).

One message at a time. To send several, await each in turn:

```ts
for (const message of batch) {
  const ack = await client.send(message);
  record(ack.controlId, ack.code);
}
```

### `client.connect()`

```ts
connect(): Promise<void>
```

Opens the connection without sending anything. Optional — `send()` connects on first use — but calling it at startup surfaces a wrong host, port, or firewall rule immediately.

Idempotent. On a connected client it resolves at once; while an attempt is in flight it waits for that attempt and shares its result.

**Throws** `MllpConnectFailedError`, `MllpConnectTimeoutError`, or `MllpClientClosedError` when the client is already closed or `close()` cancelled the attempt.

### `client.close()`

```ts
close(): Promise<void>
```

Closes the connection once the message in flight has been acknowledged. New sends are refused from the moment it is called, so an in-flight message is never cut off.

Resolves when the connection is down, from any phase. Never throws. Idempotent. The wait is bounded by the in-flight send's own deadline.

```ts
process.on("SIGTERM", async () => {
  await client.close();
  process.exit(0);
});
```

### `client.destroy()`

```ts
destroy(): Promise<void>
```

Closes the connection now, without waiting for anything in flight. A message in flight rejects with `MllpClientClosedError`.

Resolves when the connection is down, from any phase. Never throws. Idempotent.

### `client[Symbol.asyncDispose]()`

Calls `close()`. Lets a client be scoped with `await using`:

```ts
{
  await using client = new MllpClient({ socket });
  await client.send(message);
} // closed here, even if send() threw
```

### `client.state`

```ts
readonly state: MllpClientState
```

| Value        | Meaning                                                   |
| ------------ | --------------------------------------------------------- |
| `idle`       | Nothing opened yet.                                       |
| `connecting` | An attempt is in flight.                                  |
| `connected`  | Open, with no message in flight.                          |
| `sending`    | A message is on the wire, waiting for its acknowledgment. |
| `closing`    | `close()` is waiting out the message in flight.           |
| `closed`     | Done.                                                     |

A client closes once and does not reconnect. After `close()`, `destroy()`, or a failure that ended the connection, every call throws `MllpClientClosedError`; construct a new client to send again.

### `client.connected`

```ts
readonly connected: boolean
```

`true` in `connected` and `sending`, `false` everywhere else.

### `client.on(event, listener)` / `client.off(event, listener)`

```ts
on<E>(event: E, listener: MllpClientListener<E>): this
off<E>(event: E, listener: MllpClientListener<E>): this
```

Adds or removes a listener. Both return the client, so calls chain.

| Event        | Listener                                   | Fires when                                                                      |
| ------------ | ------------------------------------------ | ------------------------------------------------------------------------------- |
| `connect`    | `() => void`                               | The connection opened.                                                          |
| `disconnect` | `(error: MllpClientError \| null) => void` | The connection went down. `error` is the failure, or `null` when you closed it. |
| `close`      | `() => void`                               | The client is done. Fires once, from any phase, even if it never connected.     |

Order is fixed: `connect`, then `disconnect`, then `close`. Listeners are synchronous, and one that throws propagates to whatever triggered the event.

```ts
client
  .on("connect", () => metrics.increment("mllp.connected"))
  .on("disconnect", (error) => {
    logger.warn(
      { code: error?.code ?? "closed_by_owner" },
      "mllp disconnected"
    );
  });
```

## Runtimes

The client speaks MLLP over a pair of byte streams and knows nothing else about the transport. That whole dependency is [`MllpSocket`](#custom-socket) — two methods — so supporting a new runtime means writing an adapter, not forking the client.

Node.js is the only adapter that ships today.

### Node.js

```ts
import { nodeSocket } from "@glion/mllp-client/node";

nodeSocket(options: NodeSocketOptions): MllpSocket
```

Plain TCP over `net.Socket`.

| Option            | Type     | Default  | Description                                                                                                 |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `host`            | `string` | required | Host name or address of the receiver.                                                                       |
| `port`            | `number` | required | TCP port of the receiver.                                                                                   |
| `gracefulCloseMs` | `number` | `1000`   | How long a socket gets to end cleanly before it is destroyed.                                               |
| `keepAliveIdleMs` | `number` | `30000`  | Idle time before the first keepalive probe, so a silent NAT or firewall drop surfaces before the next send. |

`TCP_NODELAY` is set, so a message goes out immediately rather than waiting on Nagle's algorithm.

```ts
const client = new MllpClient({
  socket: nodeSocket({ host: "hl7.example.org", port: 2575 }),
});
```

### Custom Socket

You can expand `MllpSocket` to build a custom socket to one remote system, which the client opens, uses, and ends.

```ts
interface MllpSocket {
  connect(signal: AbortSignal): Promise<MllpStreams>;
  close(): Promise<void>;
}

interface MllpStreams {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
}
```

An implementation must satisfy four rules:

1. `connect()` rejects with `signal.reason` when the signal aborts, and a rejection leaves nothing open.
2. `close()` never rejects, may be called more than once, and always finishes within a bounded time, even when the receiver never answers.
3. When the socket ends, a pending read on `readable` ends or errors. Bytes sent before a clean close arrive first.
4. The client owns the streams while connected, and releases them before calling `close()`.

An implementation never sees an MLLP frame — framing belongs to the layer above.

## Errors

Every failure the client raises extends `MllpClientError` and carries a fixed `code`, so you can `switch` on it or put it in a log field without matching on messages. Errors from the layers below arrive on `cause`, never as the thrown type.

A rejection from the receiver is **not** an `MllpClientError` — see [`AckException`](#ackexception).

```ts
import { MllpClientError, MllpErrorCode } from "@glion/mllp-client";

try {
  await client.send(message);
} catch (error) {
  if (error instanceof MllpClientError) {
    switch (error.code) {
      case MllpErrorCode.SEND_TIMEOUT:
      case MllpErrorCode.CONNECTION_LOST:
        return requeue(message); // this client is finished
      case MllpErrorCode.INVALID_MESSAGE:
        return quarantine(message); // nothing was sent
      default:
        throw error;
    }
  }
}
```

### `INVALID_OPTION`

`MllpInvalidOptionError` · field: `option`

A constructor option or a per-send `timeoutMs` is out of range — a timeout that is not a positive number of milliseconds, or a `maxBufferedBytes` that is not a positive integer. `option` names which one.

Thrown before anything is opened or sent. A configuration bug, not a runtime condition.

### `INVALID_MESSAGE`

`MllpInvalidMessageError` · field: `cause`

The message cannot be sent as it stands: no MSH-10 control ID, or it could not be serialized, or its content contains a byte MLLP reserves as a frame marker.

**Nothing reached the wire and the connection is still in step**, so the next message can go out on it. Fix or quarantine the message; do not reconnect.

### `ALREADY_SENDING`

`MllpAlreadySendingError` · field: `controlId`

`send()` was called while another send was in flight. `controlId` identifies the message already on the wire.

The client is lockstep by design. Await each send before starting the next, or give each concurrent stream its own client.

### `CONNECT_FAILED`

`MllpConnectFailedError` · field: `cause`

The socket could not be opened. `cause` carries the underlying error — `ECONNREFUSED`, `ENOTFOUND`, `EHOSTUNREACH` and the like.

Check host, port, and whether a firewall allows the route. Nothing was opened, so there is nothing to close.

### `CONNECT_TIMEOUT`

`MllpConnectTimeoutError` · field: `timeoutMs`

The receiver did not accept the connection within `connectTimeoutMs`.

Typically a packet-dropping firewall rather than a refused connection — a refusal arrives fast and surfaces as `CONNECT_FAILED`.

### `CLOSED`

`MllpClientClosedError`

The client is closed, so the call cannot be served. Also the error that rejects a message in flight when `destroy()` interrupts it, and a connection attempt that `close()` cancelled.

A client closes once. Construct a new one to send again; why the old one closed reached the `disconnect` event.

### `SEND_TIMEOUT`

`MllpSendTimeoutError` · field: `timeoutMs` — **closes the connection**

No acknowledgment arrived within the send timeout.

Whether the receiver got the message is unknown: it may be slow, or it may have processed the message and failed to reply. The connection closes because a late acknowledgment can no longer be told apart from the next message's — see [Why does a failed send close the connection?](#why-does-a-failed-send-close-the-connection)

### `CONNECTION_LOST`

`MllpConnectionLostError` · fields: `controlId`, `cause` — **closes the connection**

The link went away mid-send: the receiver hung up, or the network broke. `cause` carries the stream error when there was one.

Whether the message was received is unknown. `controlId` identifies it, for your retry log.

### `INVALID_RESPONSE`

`MllpInvalidResponseError` · fields: `controlId?`, `cause` — **closes the connection**

The reply was not a usable acknowledgment of the message that was waiting. Causes, in the order they are checked:

- the bytes were not valid UTF-8 or not parseable HL7v2;
- MSA-2 names a different message — usually a late acknowledgment from an earlier timed-out send;
- MSA-1 is empty or is not one of the six codes of Table 0008;
- the reply passed `maxBufferedBytes` before it was complete.

The connection closes because the client can no longer tell which reply answers which message.

### `AckException`

From `@glion/ack` · fields: `code`, `controlId`, `text`, `errorCode`, `severity`

Not an `MllpClientError`. The receiver read the message and refused it, which is an answer rather than a fault — **the connection stays open** and the next message can go out on it.

| Field       | Source | Description                                   |
| ----------- | ------ | --------------------------------------------- |
| `code`      | MSA-1  | `AE`, `AR`, `CE`, or `CR`.                    |
| `controlId` | MSA-2  | The message being refused.                    |
| `text`      | MSA-3  | The receiver's reason, when it gave one.      |
| `errorCode` | ERR-3  | HL7v2 Table 0357 error condition, when given. |
| `severity`  | ERR-4  | `E`, `W`, or `I`, when given.                 |

The class is the MSA-1 code: `AckApplicationError` (`AE`), `AckApplicationReject` (`AR`), `AckCommitError` (`CE`), `AckCommitReject` (`CR`). An MLLP server built on Glion raises the same types, so both ends of an integration catch the same thing.

## FAQs

### Why does a failed send close the connection?

MLLP has no correlation of its own. The only thing tying a reply to a message is the receiver echoing your MSH-10 back in MSA-2 — and the only reason that can be trusted is that one message is outstanding at a time.

Once a send times out, that no longer holds. A wrong guess here reports one message's outcome under another message's identity, which in a clinical feed is worse than an error.

Clients that pipeline can survive a timeout, because they keep a table of outstanding control IDs and a background reader to match against it. A lockstep client has no table to fall back on.

### Why a socket rather than a host and port?

The client handles MLLP and deliberately handles no transport. Putting the whole runtime dependency behind two methods means the same client runs over TCP, TLS, a Unix socket, or a pair of in-memory streams — and the test suite covers every lifecycle path without opening a port.

## Part of Glion

`@glion/mllp-client` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
