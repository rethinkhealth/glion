# @glion/mllp-client

Send HL7v2 messages over MLLP and get each message's acknowledgment back.

## Install

```bash
npm install @glion/mllp-client
```

Requires Node.js 20 or later. ESM only.

### Package exports

| Subpath                   | Description                                             |
| ------------------------- | ------------------------------------------------------- |
| `@glion/mllp-client`      | `MllpClient`, the error classes, and the public types   |
| `@glion/mllp-client/node` | `connectNode`, the Node.js `net.Socket` runtime adapter |

## Use

```ts
import { MllpClient } from "@glion/mllp-client";
import { connectNode } from "@glion/mllp-client/node";

await using client = new MllpClient({
  connect: connectNode,
  host: "hl7.example.org",
  port: 2575,
});

const ack = await client.send(adtMessage);
ack.code; // "AA" or "CA"
```

`send()` connects on first use and resolves with the acknowledgment once the remote system accepts the message. `await using` closes the client when the block ends; call `close()` yourself otherwise.

### Handle the answer

A remote system that understood the message and rejected it answers with a NAK. `send()` throws it as the matching `@glion/ack` exception, and the connection stays open. Everything else the client throws extends `MllpClientError`.

```ts
import { AckException } from "@glion/ack";
import { MllpClientError } from "@glion/mllp-client";

try {
  await client.send(adtMessage);
} catch (error) {
  if (error instanceof AckException) {
    // The remote system said no. error.code is AE, AR, CE, or CR;
    // error.text carries its reason when it gave one.
  } else if (error instanceof MllpClientError) {
    // The client or the wire failed. error.code says what happened;
    // error.delivery says whether the message may have been received.
  }
}
```

### Decide whether to send again

Every `MllpClientError` carries `delivery`:

| `delivery` | Meaning                                                                      |
| ---------- | ---------------------------------------------------------------------------- |
| `not-sent` | Nothing reached the wire. Sending again is safe.                             |
| `unknown`  | The message may have been received. Send again only if it is safe to repeat. |

### Connect ahead of time

`connect()` opens the connection without sending anything, for example to fail fast at startup. It is idempotent: a connected client resolves at once, and a call made while an attempt is in flight waits for that attempt.

```ts
const client = new MllpClient({ connect: connectNode, host, port });
await client.connect();
```

## Options

| Option             | Type            | Default  | Description                                                                                        |
| ------------------ | --------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `host`             | `string`        | required | Host name or address of the remote system.                                                         |
| `port`             | `number`        | required | TCP port of the remote system.                                                                     |
| `connect`          | `MllpConnector` | required | Runtime adapter that opens the connection, such as `connectNode`.                                  |
| `connectTimeoutMs` | `number`        | `10000`  | How long a connection attempt may take.                                                            |
| `sendTimeoutMs`    | `number`        | `30000`  | How long a send may take, from writing the message to receiving its acknowledgment.                |
| `maxBufferedBytes` | `number`        | 16 MiB   | Most bytes buffered while receiving one frame. A remote system that never ends a frame is dropped. |

`send()` accepts `{ timeoutMs }` to override `sendTimeoutMs` for one message.

## API

### `new MllpClient(options)`

Creates a client for one remote system. Throws `MllpInvalidOptionError` when a timeout or byte cap is out of range.

### `client.send(message, options?)`

Sends one message and resolves with its acknowledgment. `message` is HL7v2 text or a parsed `Root`; it is serialized to canonical HL7v2 for the wire. The message must carry an MSH-10 control ID, which the acknowledgment's MSA-2 has to echo.

One message is on the wire at a time. A second `send()` while one is in flight rejects with `MllpAlreadySendingError`.

Resolves with:

| Field  | Type             | Description                                      |
| ------ | ---------------- | ------------------------------------------------ |
| `code` | `AckSuccessCode` | MSA-1, `AA` or `CA`.                             |
| `tree` | `Root`           | The acknowledgment, parsed.                      |
| `raw`  | `string`         | The acknowledgment as received, decoded to text. |

### `client.connect()`

Opens the connection ahead of the first `send()`. See [Connect ahead of time](#connect-ahead-of-time).

### `client.close()`

Ends the connection. Resolves from any state, never rejects, and resolves once the connection is actually closed. A send in flight rejects with `MllpClientClosedError`. Also available as `client[Symbol.asyncDispose]()` for `await using`.

### `client.state`, `client.connected`, `client.host`, `client.port`

`state` is `idle`, `connecting`, `connected`, `sending`, or `closed`. `connected` is true in `connected` and `sending`. `host` and `port` are the values given in the options.

A client closes once. After `close()`, or after a failure that ends the connection, every call rejects with `MllpClientClosedError`. Construct a new client to reconnect.

## Errors

Every error the client raises extends `MllpClientError` and carries `code`, `delivery`, and, when a lower layer failed, the underlying error on `cause`.

| Class                      | `code`             | `delivery` | When                                                                            |
| -------------------------- | ------------------ | ---------- | ------------------------------------------------------------------------------- |
| `MllpInvalidOptionError`   | `INVALID_OPTION`   | `not-sent` | A timeout or byte cap is out of range.                                          |
| `MllpAlreadySendingError`  | `ALREADY_SENDING`  | `not-sent` | `send()` while another message is waiting for its acknowledgment.               |
| `MllpClientClosedError`    | `CLOSED`           | `not-sent` | Any call on a closed client. The failure that closed it, if any, is on `cause`. |
| `MllpInvalidMessageError`  | `INVALID_MESSAGE`  | `not-sent` | No MSH-10, or the message could not be parsed, serialized, or framed.           |
| `MllpConnectFailedError`   | `CONNECT_FAILED`   | `not-sent` | The connection could not be opened. The connector's error is on `cause`.        |
| `MllpConnectTimeoutError`  | `CONNECT_TIMEOUT`  | `not-sent` | The connection did not open within `connectTimeoutMs`.                          |
| `MllpConnectAbortedError`  | `CONNECT_ABORTED`  | `not-sent` | `close()` was called while the connection was still opening.                    |
| `MllpSendTimeoutError`     | `SEND_TIMEOUT`     | `unknown`  | No acknowledgment within the send timeout. The client closes.                   |
| `MllpDroppedError`         | `DROPPED`          | `unknown`  | The connection was lost while a message was waiting. The client closes.         |
| `MllpInvalidResponseError` | `INVALID_RESPONSE` | `unknown`  | The reply was not a usable acknowledgment of the message. The client closes.    |

The last three close the client because MLLP is lockstep: the next frame after a message is that message's acknowledgment. Once a frame is late, missing, or answers another message, the client can no longer tell which frame answers which message, and continuing could report a message as accepted that never was.

A NAK is not an `MllpClientError`. See [Handle the answer](#handle-the-answer).

## Runtime adapters

The client talks to the network through the `connect` option, an `MllpConnector`: a function that opens one connection to a host and port and returns an `MllpConnection`.

```ts
interface MllpConnection {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
}
```

An adapter must honour three rules:

1. `close()` is idempotent, never rejects, and resolves within a bounded time even if the remote system never responds.
2. When the connection ends for any reason, a pending read on `readable` settles with end-of-stream or an error. Bytes the remote system wrote before closing gracefully arrive first.
3. The streams belong to the client for the connection's lifetime; the client releases them before calling `close()`.

The connector must reject once its `signal` aborts, leaving nothing open. The Node adapter, `connectNode` from `@glion/mllp-client/node`, implements all of this over `net.Socket`.

## Part of Glion

`@glion/mllp-client` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
