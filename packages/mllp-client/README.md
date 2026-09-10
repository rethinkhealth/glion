# @glion/mllp-client

Simple and safe MLLP client for HL7v2, for Node.js and TypeScript.

```ts
import { MllpClient } from "@glion/mllp-client";
import { nodeSocket } from "@glion/mllp-client/node";

const client = new MllpClient({
  socket: nodeSocket({ host: "hl7.example.org", port: 2575 }),
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

| Subpath                   | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `@glion/mllp-client`      | `MllpClient`, the error classes, and the public types  |
| `@glion/mllp-client/node` | `nodeSocket`, the Node.js `net.Socket` runtime adapter |

## Use

### Send a message

```ts
import { MllpClient } from "@glion/mllp-client";
import { nodeSocket } from "@glion/mllp-client/node";

await using client = new MllpClient({
  socket: nodeSocket({ host: "hl7.example.org", port: 2575 }),
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

Everything else the client throws is an `MllpClientError`, carrying a stable `code`.

```ts
import { MllpClientError } from "@glion/mllp-client";

try {
  await client.send(adtMessage);
} catch (error) {
  if (error instanceof MllpClientError) {
    console.log(error.code); //=> e.g. "SEND_TIMEOUT"
  }
}
```

### Connect early

`connect()` opens the connection without sending anything. Use it to fail fast at startup.

```ts
const client = new MllpClient({ socket: nodeSocket({ host, port }) });
await client.connect();
```

Calling it on a connected client does nothing. Calling it while a connection attempt is in flight waits for that attempt.

## Options

| Option             | Type         | Default  | Description                                                          |
| ------------------ | ------------ | -------- | -------------------------------------------------------------------- |
| `socket`           | `MllpSocket` | required | Runtime adapter, such as `nodeSocket({ host, port })`.               |
| `connectTimeoutMs` | `number`     | `10000`  | Time allowed to open the connection.                                 |
| `sendTimeoutMs`    | `number`     | `30000`  | Time allowed from writing a message to receiving its acknowledgment. |
| `maxBufferedBytes` | `number`     | 16 MiB   | Largest incoming message. A larger one drops the connection.         |

`send(message, { timeoutMs })` overrides `sendTimeoutMs` for one message.

## API

### `new MllpClient(options)`

Creates a client for one remote system. Throws `MllpInvalidOptionError` if a timeout or byte cap is out of range.

### `client.send(message, options?)`

Sends one message and resolves with its acknowledgment. The message must have an MSH-10 control ID.

One message at a time. A second `send()` while one is in flight throws `MllpAlreadySendingError`.

| Field       | Type             | Description                                              |
| ----------- | ---------------- | -------------------------------------------------------- |
| `code`      | `AckSuccessCode` | MSA-1, `AA` or `CA`.                                     |
| `controlId` | `string`         | MSA-2: the MSH-10 of the message this answers.           |
| `id`        | `string`         | MSH-10 of the acknowledgment itself.                     |
| `text`      | `string?`        | MSA-3, the remote system's diagnostic, when it gave one. |
| `tree`      | `Root`           | The acknowledgment, parsed.                              |
| `raw`       | `string`         | The acknowledgment as text.                              |

### `client.connect()`

Opens the connection. See [Connect early](#connect-early).

### `client.close()`

Closes the connection once the message in flight has been acknowledged. Never throws. Resolves once the connection is down. New sends are refused from the moment it is called. Also available as `client[Symbol.asyncDispose]()`.

### `client.destroy()`

Closes the connection now, without waiting. Never throws. Resolves once the connection is down. A message in flight rejects with `MllpClientClosedError`.

### `client.state`

`idle`, `connecting`, `connected`, `sending`, `closing`, or `closed`. `client.connected` is `true` in `connected` and `sending`.

A client closes once. After `close()`, or after a failure that closes the connection, every call throws `MllpClientClosedError`. Create a new client to reconnect.

## Events

`client.on(event, listener)` registers a listener; `client.off(event, listener)` removes it. Both return the client.

| Event        | Listener                                   | When                                                                        |
| ------------ | ------------------------------------------ | --------------------------------------------------------------------------- |
| `connect`    | `() => void`                               | The connection opened.                                                      |
| `disconnect` | `(error: MllpClientError \| null) => void` | The connection went down. `error` is the failure, or `null` on a `close()`. |
| `close`      | `() => void`                               | The client closed. Fires once, from any phase.                              |

```ts
client.on("disconnect", (error) => {
  console.log(error?.code ?? "closed by this process");
});
```

## Errors

| Class                      | `code`             | When                                                                                                         |
| -------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `MllpInvalidOptionError`   | `INVALID_OPTION`   | A timeout or byte cap is out of range.                                                                       |
| `MllpAlreadySendingError`  | `ALREADY_SENDING`  | A send is already in flight.                                                                                 |
| `MllpClientClosedError`    | `CLOSED`           | The client is closed, or `close()` cancelled a connection attempt. The failure that closed it is on `cause`. |
| `MllpInvalidMessageError`  | `INVALID_MESSAGE`  | No MSH-10, or the message could not be serialized or sent as-is.                                             |
| `MllpConnectFailedError`   | `CONNECT_FAILED`   | The connection could not be opened. Details on `cause`.                                                      |
| `MllpConnectTimeoutError`  | `CONNECT_TIMEOUT`  | The connection did not open in time.                                                                         |
| `MllpSendTimeoutError`     | `SEND_TIMEOUT`     | No acknowledgment in time. Closes the client.                                                                |
| `MllpConnectionLostError`  | `CONNECTION_LOST`  | The connection was lost mid-send. Closes the client.                                                         |
| `MllpInvalidResponseError` | `INVALID_RESPONSE` | The reply was not an acknowledgment of the message. Closes the client.                                       |

The last three close the client on purpose. MLLP is lockstep: the next message the remote system sends answers the last one sent. After a late, lost, or unreadable reply, the client can no longer tell which reply answers which message, so it stops rather than guess.

## Runtime adapters

The `socket` option is an `MllpSocket`: one socket to one remote system, which the client opens, uses, and ends.

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

Rules for an adapter:

1. `connect()` rejects with `signal.reason` when the signal aborts, and a rejection leaves nothing open.
2. `close()` never rejects, can be called more than once, and always finishes within a bounded time, even if the remote system never answers.
3. When the socket ends, a pending read on `readable` ends or errors. Bytes sent before a clean close arrive first.
4. The client owns the streams while connected and releases them before calling `close()`.

An adapter never sees an MLLP frame: framing belongs to the layer above. `nodeSocket` from `@glion/mllp-client/node` does all of this over `net.Socket`.

## Part of Glion

`@glion/mllp-client` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
