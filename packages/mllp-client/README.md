# @glion/mllp-client

An HL7v2 MLLP client for Node.js, Bun, Deno, and Cloudflare Workers.

- 📦 **MLLP built in.** Framing, message boundaries and acknowledgment matching are handled. You send a parsed message and get one back.
- 🔄 **Predictable connection lifecycle.** Timeouts on connecting and on waiting for a reply, connection attempts retried with backoff, TCP keepalive by default, and explicit states you can read.
- ⚡ **Thin over TCP.** One socket, one message on the wire at a time. Further sends queue in call order. No worker threads, no polling.
- 🧯 **Errors you can act on.** Every failure carries a stable code and says whether the connection is still usable.
- 🧩 **Any transport.** TCP and TLS on Node.js, Bun, Deno, and Cloudflare Workers included. An in-memory or custom socket plugs in behind the same two-method interface.
- 🔤 **Typed end to end.** TypeScript throughout, with parsed HL7v2 going in and coming out.

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

### Reconnect

A connection that cannot be opened is dialed again. By default the client makes five further attempts, waiting a random time before each: up to 1 s, then 2 s, 4 s, 8 s, and 16 s, so it gives up about 30 seconds after the first failure and closes with the last attempt's error. `attempts: Infinity` keeps dialing; `close()` stops it. A `send()` that arrives while the client is connecting waits for the outcome.

A connection that is lost is not restored. The client closes with the failure, and the message in flight is **not sent again**: its `send()` rejects, and whether the receiver got it is the caller's to decide. A client is as disposable as a socket: construct a new one to send again.

```ts
const client = new MllpClient({
  socket: nodeSocket({ host: "hl7.example.org", port: 2575 }),
  reconnect: {
    attempts: 20,
    delay: (attempt) => {
      logger.warn({ attempt }, "mllp reconnecting");
      return Math.min(30_000, 500 * 2 ** attempt);
    },
  },
});
```

`reconnect: false` turns it off: the client dials once.

## Options

| Option             | Type                            | Default   | Description                                                                                            |
| ------------------ | ------------------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| `socket`           | `MllpSocket`                    | required  | Runtime adapter, such as `nodeSocket({ host, port })`.                                                 |
| `connectTimeoutMs` | `number`                        | `10000`   | Time allowed to open the connection. Exceeded: `MllpConnectionTimeoutError`.                           |
| `sendTimeoutMs`    | `number`                        | `30000`   | Time allowed from writing a message to receiving its acknowledgment. Exceeded: `MllpSendTimeoutError`. |
| `maxBufferedBytes` | `number`                        | 16 MiB    | Largest reply the client buffers. Exceeded: `MllpInvalidResponseError`.                                |
| `reconnect`        | `MllpReconnectOptions \| false` | see below | How the client dials again after a failed attempt. `false` dials once.                                 |

`send(message, { timeoutMs })` overrides `sendTimeoutMs` for one message.

`MllpReconnectOptions`:

| Option     | Type                          | Default                                      | Description                                                                        |
| ---------- | ----------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `attempts` | `number`                      | `5`                                          | Attempts after a failed one before the client closes. `Infinity` for no limit.     |
| `delay`    | `(attempt: number) => number` | full-jitter backoff from 1 s, capped at 30 s | Milliseconds to wait before `attempt` (from 1). Called only while attempts remain. |

## API

### `new MllpClient(options)`

```ts
new MllpClient(options: MllpClientOptions): MllpClient
```

Creates a client for one remote system. Nothing is opened until the first `connect()` or `send()`.

**Parameters** — see [Options](#options).

**Throws** `MllpInvalidOptionError` when a timeout is not a positive number of milliseconds, `maxBufferedBytes` is not a positive integer, or `reconnect.attempts` is not a non-negative integer.

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
- `MllpClientClosedError` — the client is closed, or closed while this send was waiting its turn.
- `MllpConnectionFailedError`, `MllpConnectionTimeoutError` — the connection could not be opened.
- `MllpSendTimeoutError`, `MllpConnectionLostError`, `MllpInvalidResponseError` — the exchange failed. These close the connection; see [Errors](#errors).
- `MllpSendAbortedError` — `destroy()` cut the send off. Delivery is unknown.

Every error carries `delivery`, `not-sent` or `unknown`, the one fact a retry needs; see [Errors](#errors).

One message is on the wire at a time. A `send()` arriving while another is in flight waits its turn, and sends go out in the order they were called, so a batch may be fired at once:

```ts
const outcomes = await Promise.allSettled(
  batch.map((message) => client.send(message))
);
```

The queue is in memory and has no bound. `timeoutMs` runs from the moment the write starts, not from the call. A send still waiting when `close()` or `destroy()` is called, or when a failure closes the client, rejects at once with `delivery: "not-sent"`: with `MllpClientClosedError`, or with the failure itself when the failure is one of not being sent, such as the dial's `MllpConnectionFailedError` or `MllpConnectionTimeoutError`, as `connect()` gets. Nothing behind a failed message goes out. See [Does `send()` queue?](#does-send-queue).

### `client.connect()`

```ts
connect(): Promise<void>
```

Opens the connection without sending anything, dialing again under the [reconnect](#reconnect) policy when an attempt fails. Optional — `send()` connects on first use — but calling it at startup surfaces a wrong host, port, or firewall rule as soon as the policy gives up.

Idempotent. On a connected client it resolves at once; while an attempt is in flight it waits for the outcome and shares it.

**Throws** the last attempt's `MllpConnectionFailedError` or `MllpConnectionTimeoutError`, or `MllpClientClosedError` when the client is already closed or `close()` or `destroy()` cancelled the attempt.

### `client.close()`

```ts
close(): Promise<void>
```

Closes the connection once the message in flight has been acknowledged. New sends, and sends still waiting their turn, are refused from the moment it is called with `MllpClientClosedError`; the message in flight is never cut off. Await the sends you want delivered before calling it. An attempt to connect stops at once.

Resolves when the connection is down, from any phase. Never throws. Idempotent. The wait is bounded by the in-flight send's own deadline. If the message it waits for fails, the client closes with that failure; otherwise with `null`, the owner's decision.

```ts
process.on("SIGTERM", async () => {
  await client.close();
  process.exit(0);
});
```

### `client.destroy(reason?)`

```ts
destroy(reason?: MllpClientError | null): Promise<void>
```

Closes the connection now, without waiting for anything in flight. A message in flight rejects with `MllpSendAbortedError`. An attempt to connect stops at once. The client closes with `reason`: the `close` event carries it, and so does `cause` on every later call's `MllpClientClosedError`. Omitted or `null`, the client closed by its owner's decision, as `net.Socket.destroy(error)` does. Sends waiting their turn are rejected with `reason` itself when its delivery is `not-sent`, and with `MllpClientClosedError` carrying `reason` otherwise. Arriving while the client is already closing, it cuts the message in flight and joins the ending under way; `reason` is recorded when no failure is known yet.

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

| Value        | Meaning                                                                          |
| ------------ | -------------------------------------------------------------------------------- |
| `idle`       | Nothing opened yet. The first `send()` or `connect()` opens the connection.      |
| `connecting` | The connection is being opened, further attempts included.                       |
| `connected`  | Open, with no message in flight.                                                 |
| `sending`    | A message is on the wire, waiting for its acknowledgment. Further sends wait.    |
| `closing`    | The client is ending: a message being waited out, or the connection coming down. |
| `closed`     | The connection is down.                                                          |

A client closes once. After `close()`, `destroy()`, a connection the reconnect policy could not open, or a connection that was lost, every call throws `MllpClientClosedError`; construct a new client to send again.

### `client.pending`

```ts
readonly pending: number
```

How many sends wait their turn, the one in flight excluded. The queue's backlog, for a metric or a backpressure decision; `0` whenever nothing waits.

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

| Event     | Listener                                   | Fires when                                                                                                                                                   |
| --------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `connect` | `() => void`                               | The connection opened.                                                                                                                                       |
| `close`   | `(error: MllpClientError \| null) => void` | The connection is down. Fires once, from any phase, even if it never connected. `error` is the failure that closed the client, or `null` when you closed it. |

A lost connection is not an event of its own: it closes the client, so `close` fires with the failure. Listeners are synchronous, and one that throws propagates to whatever triggered the event.

```ts
client
  .on("connect", () => metrics.increment("mllp.connected"))
  .on("close", (error) => {
    logger.warn({ code: error?.code ?? "closed_by_owner" }, "mllp closed");
  });
```

## Runtimes

The client speaks MLLP over a pair of byte streams and knows nothing else about the transport. That whole dependency is [`MllpSocket`](#custom-socket) — two methods — so supporting a runtime means an adapter, not a fork of the client.

| Runtime            | Adapter                                | Import                       | TLS                                         | Proven by                                                                                                                               |
| ------------------ | -------------------------------------- | ---------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js ≥ 22       | [`nodeSocket`](#nodejs)                | `@glion/mllp-client/node`    | [Trust store, CA, client certificate](#tls) | Conformance suite in CI, Node 22 and 24                                                                                                 |
| Bun                | [`nodeSocket`](#nodejs)                | `@glion/mllp-client/node`    | [Trust store, CA, client certificate](#tls) | Conformance suite in CI, Bun 1.4                                                                                                        |
| Deno               | [`nodeSocket`](#nodejs)                | `@glion/mllp-client/node`    | [Trust store, CA, client certificate](#tls) | Conformance suite in CI, Deno 2.9                                                                                                       |
| Cloudflare Workers | [`workersSocket`](#cloudflare-workers) | `@glion/mllp-client/workers` | Public trust store only                     | Integration suite in CI, inside `workerd`; TCP only, TLS handshake untested ([#626](https://github.com/rethinkhealth/glion/issues/626)) |

Every adapter runs the same conformance suite: the [`MllpSocket` contract](#custom-socket) case by case, and the client's behaviour over a real socket scenario by scenario. On Node.js, Bun, and Deno it runs twice, over TCP and over TLS. A custom socket can run it too; see `tests/integration/conformance/` in the package source.

### Node.js

```ts
import { nodeSocket } from "@glion/mllp-client/node";

nodeSocket(options: NodeSocketOptions): MllpSocket
```

TCP over `net.Socket`, or TLS over `tls.TLSSocket` when `tls` is set. The same adapter runs on Bun and Deno through their `node:net` and `node:tls` compatibility; no separate import is needed there.

| Option            | Type                        | Default  | Description                                                                                                                                                                              |
| ----------------- | --------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host`            | `string`                    | required | Host name or address of the receiver.                                                                                                                                                    |
| `port`            | `number`                    | required | TCP port of the receiver.                                                                                                                                                                |
| `tls`             | `boolean \| NodeTlsOptions` | `false`  | TLS for the connection. See [TLS](#tls).                                                                                                                                                 |
| `gracefulCloseMs` | `number`                    | `1000`   | How long a socket gets to end cleanly before it is destroyed.                                                                                                                            |
| `keepAliveIdleMs` | `number`                    | `30000`  | Idle time before the first keepalive probe. Once the probes fail, the OS ends the socket, and the next send fails at once with `CONNECTION_LOST` instead of waiting out `sendTimeoutMs`. |

`TCP_NODELAY` is set, so a message goes out immediately rather than waiting on Nagle's algorithm. On Bun and Deno the keepalive delay is passed through to the runtime; whether the runtime honours it is not verified.

```ts
const client = new MllpClient({
  socket: nodeSocket({ host: "hl7.example.org", port: 2575 }),
});
```

Deno needs `--allow-net` for the receiver's host and port.

#### TLS

`tls: true` verifies the receiver's certificate against the runtime's trusted CAs, for `host`, and needs no certificate files. `host` is sent as the server name (SNI) unless it is an IP address.

```ts
nodeSocket({ host: "hl7.example.org", port: 2575, tls: true });
```

An object passes Node's `tls.connect()` options:

| Option               | Type                        | Default                      | Description                                                                                      |
| -------------------- | --------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `ca`                 | `string \| Buffer \| Array` | Runtime CAs                  | CA certificates that issued the receiver's certificate, PEM. Replaces the runtime's trusted CAs. |
| `cert`               | `string \| Buffer \| Array` | none                         | Client certificate chain for mutual TLS, PEM.                                                    |
| `key`                | `string \| Buffer \| Array` | none                         | Private key for `cert`, PEM.                                                                     |
| `passphrase`         | `string`                    | none                         | Passphrase for an encrypted `key` or `pfx`.                                                      |
| `pfx`                | `string \| Buffer \| Array` | none                         | Client certificate and key as PKCS#12.                                                           |
| `servername`         | `string`                    | `host`, unless an IP address | Name the receiver's certificate is verified against, and the SNI name.                           |
| `rejectUnauthorized` | `boolean`                   | `true`                       | `false` accepts any certificate, including one presented by an attacker.                         |

```ts
import { readFileSync } from "node:fs";

nodeSocket({
  host: "10.20.0.15",
  port: 2575,
  tls: {
    ca: readFileSync("hospital-ca.pem"),
    cert: readFileSync("client.pem"),
    key: readFileSync("client-key.pem"),
    servername: "hl7.hospital.internal",
  },
});
```

A receiver dialed by IP address must present a certificate that lists that address, or `servername` must name one the certificate lists.

A handshake that fails rejects with [`CONNECTION_FAILED`](#connection_failed), with Node's TLS error on `cause`: for example `UNABLE_TO_VERIFY_LEAF_SIGNATURE` or `ERR_TLS_CERT_ALTNAME_INVALID`.

A receiver that refuses the client certificate over TLS 1.2 fails the handshake: [`CONNECTION_FAILED`](#connection_failed), nothing sent. Over TLS 1.3 it refuses after the handshake, so the connection opens and the first `send()` rejects with `CONNECTION_LOST`, delivery `unknown`.

On Deno, a wrong `passphrase` does not fail the handshake; the connection opens without the client certificate and fails as a refused client certificate.

### Cloudflare Workers

```ts
import { workersSocket } from "@glion/mllp-client/workers";

workersSocket(options: WorkersSocketOptions): MllpSocket
```

TCP or TLS over `cloudflare:sockets`. The module resolves only inside the Workers runtime; import it from the `./workers` subpath, never from `.`.

| Option | Type      | Default  | Description                                                                                   |
| ------ | --------- | -------- | --------------------------------------------------------------------------------------------- |
| `host` | `string`  | required | Host name or address of the receiver.                                                         |
| `port` | `number`  | required | TCP port of the receiver.                                                                     |
| `tls`  | `boolean` | `false`  | `true` verifies the receiver's certificate against the public CAs Workers trusts, for `host`. |

```ts
import { MllpClient } from "@glion/mllp-client";
import { workersSocket } from "@glion/mllp-client/workers";

export default {
  async fetch(request: Request): Promise<Response> {
    await using client = new MllpClient({
      socket: workersSocket({ host: "hl7.example.org", port: 2575 }),
    });
    const ack = await client.send(await messageFrom(request));
    return Response.json({ code: ack.code, controlId: ack.controlId });
  },
};
```

What differs from Node:

- A Worker reaches only endpoints routable from Cloudflare's network. A receiver on a private network needs a publicly reachable endpoint in front of it.
- `close()` resolves as soon as the runtime has ended the socket; there is no grace window.
- Locally, under Miniflare (`wrangler dev` or the Vitest integration), connections go through a proxy, so `MllpConnectionFailedError.cause` carries the proxy's message rather than a socket error code. `code` is the same in both.
- Locally, under Miniflare, a `tls: true` connection fails with the proxy's message, whatever certificate the receiver presents. TLS to a receiver works only when the Worker runs on Cloudflare.
- Cloudflare blocks some destination ports.
- `tls` takes no CA, client certificate, or server name. The receiver must present a publicly trusted certificate for `host`, so dial a host name rather than an address. Any value other than a boolean throws `MllpInvalidOptionError`.

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

Every failure the client raises extends `MllpClientError` and carries three fixed things: a `code`, one word per class for a `switch` or a log field; a `delivery`, what became of the message; and a message that never changes. Errors from the layers below arrive on `cause`, never as the thrown type.

A rejection from the receiver is **not** an `MllpClientError` — see [`AckException`](#ackexception).

`delivery` is the one fact a retry decision needs:

| `delivery` | Meaning                                                                           | Codes                                                                                    |
| ---------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `not-sent` | Nothing reached the wire. The message may be sent again as it is.                 | `INVALID_OPTION`, `INVALID_MESSAGE`, `CLOSED`, `CONNECTION_FAILED`, `CONNECTION_TIMEOUT` |
| `unknown`  | The message may have reached the receiver. Sending it again may deliver it twice. | `SEND_TIMEOUT`, `CONNECTION_LOST`, `SEND_ABORTED`, `INVALID_RESPONSE`                    |

```ts
import { MllpClientError, MllpErrorCode } from "@glion/mllp-client";

try {
  await client.send(message);
} catch (error) {
  if (error instanceof MllpClientError) {
    if (error.delivery === "not-sent") {
      return requeue(message); // safe to send again
    }
    switch (error.code) {
      case MllpErrorCode.INVALID_RESPONSE:
        return quarantine(message); // the receiver answered, unreadably
      default:
        return holdForReview(message); // it may already have been processed
    }
  }
}
```

The four failures of the wire — `CONNECTION_FAILED`, `CONNECTION_TIMEOUT`, `SEND_TIMEOUT`, `CONNECTION_LOST` — also extend `MllpConnectionError`, one `instanceof` for "the link, not the message".

### `INVALID_OPTION`

`MllpInvalidOptionError` · delivery `not-sent`

A constructor option or a per-send `timeoutMs` is out of range — a timeout that is not a positive number of milliseconds, a `maxBufferedBytes` that is not a positive integer, or a `reconnect.attempts` that is not a non-negative integer or `Infinity`. `workersSocket()` also throws it for a `tls` that is not a boolean. The message names which one.

Thrown before anything is opened or sent. A configuration bug, not a runtime condition.

### `INVALID_MESSAGE`

`MllpInvalidMessageError` · delivery `not-sent` · field: `cause`

The message cannot be sent as it stands: no MSH-10 control ID, or it could not be serialized, or its content contains a byte MLLP reserves as a frame marker.

**Nothing reached the wire and the connection is still in step**, so the next message can go out on it. Fix or quarantine the message; do not reconnect.

### `CLOSED`

`MllpClientClosedError` · delivery `not-sent` · field: `cause`

The client is closed or closing, so the call cannot be served. Also the error a `connect()` gets when `close()` or `destroy()` cancelled the attempt it was waiting for, and the error a `send()` gets when the client closed while it was waiting its turn; a send waiting behind a dial that failed gets the dial's error instead.

A client closes once. Construct a new one to send again. When the client closed on a failure, `cause` is that failure: the last attempt's `CONNECTION_FAILED` or `CONNECTION_TIMEOUT` when the reconnect policy gave up, the `CONNECTION_LOST`, `SEND_TIMEOUT`, or `INVALID_RESPONSE` that ended an earlier message, including one `close()` was waiting out, or the `reason` given to `destroy()`.

### `CONNECTION_FAILED`

`MllpConnectionFailedError` · delivery `not-sent` · field: `cause`

The socket could not be opened. `cause` carries the underlying error — `ECONNREFUSED`, `ENOTFOUND`, `EHOSTUNREACH`, or a TLS error such as `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

Check host, port, whether a firewall allows the route, and, over TLS, the certificate the receiver presents. Nothing was opened, so there is nothing to close.

### `CONNECTION_TIMEOUT`

`MllpConnectionTimeoutError` · delivery `not-sent` · field: `timeoutMs`

The receiver did not accept the connection within `connectTimeoutMs`.

Typically a packet-dropping firewall rather than a refused connection — a refusal arrives fast and surfaces as `CONNECTION_FAILED`. With `tls` set, also a receiver that speaks plain TCP and never answers the TLS handshake.

### `SEND_TIMEOUT`

`MllpSendTimeoutError` · delivery `unknown` · field: `timeoutMs` — **closes the connection**

No acknowledgment arrived within the send timeout.

Whether the receiver got the message is unknown: it may be slow, or it may have processed the message and failed to reply. The connection closes because a late acknowledgment can no longer be told apart from the next message's — see [Why does a failed send close the connection?](#why-does-a-failed-send-close-the-connection). The client closes with this error; the message is not sent again.

### `CONNECTION_LOST`

`MllpConnectionLostError` · delivery `unknown` · field: `cause` — **closes the connection**

The link went away mid-send: the receiver hung up, or the network broke. `cause` carries the stream error when there was one.

Whether the message was received is unknown. The client closes with this error; the message is not sent again.

### `SEND_ABORTED`

`MllpSendAbortedError` · delivery `unknown`

`destroy()` cut off the message in flight. `close()` never raises this: it waits the message out.

### `INVALID_RESPONSE`

`MllpInvalidResponseError` · delivery `unknown` · fields: `controlId?`, `cause` — **closes the connection**

The reply was not a usable acknowledgment of the message that was waiting. Causes, in the order they are checked:

- the bytes were not valid UTF-8 or not parseable HL7v2;
- MSA-2 names a different message — usually a late acknowledgment from an earlier timed-out send;
- MSA-1 is empty or is not one of the six codes of Table 0008;
- the reply passed `maxBufferedBytes` before it was complete;
- the connection closed partway through the reply.

The connection closes because the client can no longer tell which reply answers which message. The client closes with this error.

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

The client closes with the failure, and never sends the failed message again — only you know whether the receiver already has it. Construct a new client to go on, as you would open a new socket.

### Does `send()` queue?

Yes, in memory and without a bound. A `send()` arriving while a message is on the wire waits for that message's acknowledgment, then goes out; sends leave in the order they were called, one at a time, so an A01 fired before its A03 reaches the receiver first. Nothing goes out behind a message whose delivery is unknown: a failure closes the client, and every send still waiting rejects with `CLOSED` and `delivery: "not-sent"`. A send waiting behind a dial that fails rejects with the dial's error, as `connect()` does.

The queue exists only in this process. A message waiting in it is not on disk, so a crash loses it without a trace, and a producer faster than the receiver grows it without limit. An interface that must not lose events keeps its own persistent outbound queue and hands the client one message at a time; the client's line is for a batch whose outcomes the caller is awaiting.

### Why a socket rather than a host and port?

The client handles MLLP and deliberately handles no transport. Putting the whole runtime dependency behind two methods means the same client runs over TCP, TLS, a Unix socket, or a pair of in-memory streams — and the test suite covers every lifecycle path without opening a port.

## Part of Glion

`@glion/mllp-client` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
