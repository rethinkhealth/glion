# @glion/mllp-client

Simple and safe MLLP client for HL7v2, for Node.js and TypeScript.

```ts
import { MllpClient } from "@glion/mllp-client";
import { connectNode } from "@glion/mllp-client/node";

const client = new MllpClient({
  host: "hl7.example.org",
  port: 2575,
  connect: connectNode,
});

const ack = await client.send(message);
console.log(ack.code); //=> "AA"
```

## Features

- Send a message, get its acknowledgment back
- Acknowledgments matched by control ID
- NAKs thrown as `@glion/ack` exceptions
- Typed errors with a stable `code`
- Every error says whether the message may have been received
- Connect and send timeouts
- Connects on first `send()`
- `await using` support
- Node.js adapter included; other runtimes through a small interface
- Written in TypeScript; messages are `@glion/parser` trees

## Install

```bash
npm install @glion/mllp-client
```

Node.js 20 or later. ESM only.

### Package exports

| Subpath                   | Description                                             |
| ------------------------- | ------------------------------------------------------- |
| `@glion/mllp-client`      | `MllpClient`, the error classes, and the public types   |
| `@glion/mllp-client/node` | `connectNode`, the Node.js `net.Socket` runtime adapter |

## Use

### Send a message

```ts
import { MllpClient } from "@glion/mllp-client";
import { connectNode } from "@glion/mllp-client/node";

await using client = new MllpClient({
  connect: connectNode,
  host: "hl7.example.org",
  port: 2575,
});

const ack = await client.send(adtMessage);
ack.code; //=> "AA" or "CA"
ack.raw; //=> the acknowledgment as text
ack.tree; //=> the acknowledgment as a tree
```

`send()` takes HL7v2 text or a parsed `Root`. It connects on first use. `await using` closes the client at the end of the block; without it, call `close()`.

### Handle a NAK

When the remote system rejects a message, `send()` throws an `@glion/ack` exception. The connection stays open.

```ts
import { AckException } from "@glion/ack";

try {
  await client.send(adtMessage);
} catch (error) {
  if (error instanceof AckException) {
    console.log(error.code); //=> "AE", "AR", "CE", or "CR"
    console.log(error.text); //=> the remote system's reason, if it gave one
  }
}
```

### Handle a failure

Everything else the client throws is an `MllpClientError`. Check `delivery` before you send the message again.

```ts
import { MllpClientError } from "@glion/mllp-client";

try {
  await client.send(adtMessage);
} catch (error) {
  if (error instanceof MllpClientError) {
    console.log(error.code); //=> e.g. "SEND_TIMEOUT"
    console.log(error.delivery); //=> "not-sent" or "unknown"
  }
}
```

| `delivery` | Meaning                                                                      |
| ---------- | ---------------------------------------------------------------------------- |
| `not-sent` | Nothing reached the wire. Safe to send again.                                |
| `unknown`  | The message may have been received. Send again only if it is safe to repeat. |

### Connect early

`connect()` opens the connection without sending anything. Use it to fail fast at startup.

```ts
const client = new MllpClient({ connect: connectNode, host, port });
await client.connect();
```

Calling it on a connected client does nothing. Calling it while a connection attempt is in flight waits for that attempt.

## Options

| Option             | Type            | Default  | Description                                                          |
| ------------------ | --------------- | -------- | -------------------------------------------------------------------- |
| `host`             | `string`        | required | Host of the remote system.                                           |
| `port`             | `number`        | required | Port of the remote system.                                           |
| `connect`          | `MllpConnector` | required | Runtime adapter, such as `connectNode`.                              |
| `connectTimeoutMs` | `number`        | `10000`  | Time allowed to open the connection.                                 |
| `sendTimeoutMs`    | `number`        | `30000`  | Time allowed from writing a message to receiving its acknowledgment. |
| `maxBufferedBytes` | `number`        | 16 MiB   | Largest incoming frame. Larger frames drop the connection.           |

`send(message, { timeoutMs })` overrides `sendTimeoutMs` for one message.

## API

### `new MllpClient(options)`

Creates a client for one remote system. Throws `MllpInvalidOptionError` if a timeout or byte cap is out of range.

### `client.send(message, options?)`

Sends one message and resolves with its acknowledgment. The message must have an MSH-10 control ID.

One message at a time. A second `send()` while one is in flight throws `MllpAlreadySendingError`.

| Field  | Type             | Description                 |
| ------ | ---------------- | --------------------------- |
| `code` | `AckSuccessCode` | MSA-1, `AA` or `CA`.        |
| `tree` | `Root`           | The acknowledgment, parsed. |
| `raw`  | `string`         | The acknowledgment as text. |

### `client.connect()`

Opens the connection. See [Connect early](#connect-early).

### `client.close()`

Closes the connection. Never throws. Resolves once the connection is closed. A send in flight throws `MllpClientClosedError`. Also available as `client[Symbol.asyncDispose]()`.

### `client.state`

`idle`, `connecting`, `connected`, `sending`, or `closed`. `client.connected` is `true` in `connected` and `sending`.

A client closes once. After `close()`, or after a failure that closes the connection, every call throws `MllpClientClosedError`. Create a new client to reconnect.

## Errors

| Class                      | `code`             | `delivery` | When                                                                   |
| -------------------------- | ------------------ | ---------- | ---------------------------------------------------------------------- |
| `MllpInvalidOptionError`   | `INVALID_OPTION`   | `not-sent` | A timeout or byte cap is out of range.                                 |
| `MllpAlreadySendingError`  | `ALREADY_SENDING`  | `not-sent` | A send is already in flight.                                           |
| `MllpClientClosedError`    | `CLOSED`           | `not-sent` | The client is closed. The failure that closed it is on `cause`.        |
| `MllpInvalidMessageError`  | `INVALID_MESSAGE`  | `not-sent` | No MSH-10, or the message could not be parsed or framed.               |
| `MllpConnectFailedError`   | `CONNECT_FAILED`   | `not-sent` | The connection could not be opened. Details on `cause`.                |
| `MllpConnectTimeoutError`  | `CONNECT_TIMEOUT`  | `not-sent` | The connection did not open in time.                                   |
| `MllpConnectAbortedError`  | `CONNECT_ABORTED`  | `not-sent` | `close()` was called while connecting.                                 |
| `MllpSendTimeoutError`     | `SEND_TIMEOUT`     | `unknown`  | No acknowledgment in time. Closes the client.                          |
| `MllpDroppedError`         | `DROPPED`          | `unknown`  | The connection was lost mid-send. Closes the client.                   |
| `MllpInvalidResponseError` | `INVALID_RESPONSE` | `unknown`  | The reply was not an acknowledgment of the message. Closes the client. |

The last three close the client on purpose. MLLP is lockstep: the next frame answers the last message. After a late, lost, or wrong frame, the client can no longer tell which frame answers which message, so it stops rather than guess.

## Runtime adapters

The `connect` option is an `MllpConnector`: a function that opens one connection and returns an `MllpConnection`.

```ts
interface MllpConnection {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
}
```

Rules for an adapter:

1. `close()` never throws, can be called more than once, and always finishes, even if the remote system never answers.
2. When the connection ends, a pending read on `readable` ends or errors. Bytes sent before a clean close arrive first.
3. The client owns the streams while connected and releases them before calling `close()`.

The connector must reject when its `signal` aborts. `connectNode` from `@glion/mllp-client/node` does all of this over `net.Socket`.

## Part of Glion

`@glion/mllp-client` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
