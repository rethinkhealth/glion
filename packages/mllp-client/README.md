# @glion/mllp-client

MLLP client for sending HL7v2 messages and receiving acknowledgments.

## What it does

`@glion/mllp-client` exports an `MllpClient` class that sends HL7v2 messages over MLLP/TCP and returns the parsed acknowledgment. Each `send()` opens a one-shot TCP (or TLS) connection, MLLP-frames the message, awaits a single ACK frame, parses it, and tears the connection down — modeled after a single HTTP request/response. NAK responses (MSA-1 ∈ {AE, AR, CE, CR}) are thrown as the matching `AckException` subclass from `@glion/ack`, so callers catch the same exception types that `@glion/mllp-ack` produces on the receiver side. Each thrown exception carries the original raw ACK on its `raw` attribute, so callers can re-parse, log, or persist the wire payload without intercepting the response separately. Transport-level failures (connection refused, timeout, malformed frame) are thrown as `MllpClientError`, a subclass of `MllpError` from `@glion/mllp-transport`.

## Install

```bash
npm install @glion/mllp-client @glion/ack
```

`@glion/ack` is required because `client.send()` throws its `AckException` subclasses on NAK responses; install it alongside the client so application code can `import { AckApplicationError } from "@glion/ack"` directly.

## Runtime support

`@glion/mllp-client` runs on every JavaScript runtime that can open a raw TCP socket. Pick the import path that matches your runtime — the client API is identical in every case.

| Runtime                | Import path                  | Connector                          |
| ---------------------- | ---------------------------- | ---------------------------------- |
| **Node.js / Bun**      | `@glion/mllp-client`         | `node:net` / `node:tls` (default)  |
| **Deno**               | `@glion/mllp-client/deno`    | `Deno.connect` / `Deno.connectTls` |
| **Cloudflare Workers** | `@glion/mllp-client/workers` | `cloudflare:sockets`               |

Bundlers that honour the `workerd` and `deno` keys in this package's `exports` map will automatically pick the right entry for the target runtime when you import the bare `@glion/mllp-client`. The explicit subpaths exist for clarity and for monorepos that mix runtimes in one workspace.

**Browsers cannot run this client directly** — they have no API for raw TCP sockets.

## Use

```ts
import { MllpClient } from "@glion/mllp-client";

const client = new MllpClient({ host: "127.0.0.1", port: 2575 });

const ack = await client.send(
  [
    "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1",
    "EVN|A01|20240101120000",
    "PID|1||12345^^^MRN||Doe^John",
  ].join("\r")
);

console.log(ack.code); // "AA"
console.log(ack.controlId); // "MSG001"
```

Catch a NAK from the receiver as a typed exception. The original raw ACK is available on `error.raw`:

```ts
import { AckApplicationError, AckApplicationReject } from "@glion/ack";
import { MllpClient, MllpClientError } from "@glion/mllp-client";

const client = new MllpClient({ host: "127.0.0.1", port: 2575 });

try {
  await client.send(rawMessage);
} catch (error) {
  if (error instanceof AckApplicationError) {
    // MSA-1 = AE — receiver returned an application-level error.
    // error.message holds MSA-3; error.errorCode holds ERR-3; error.severity holds ERR-4.
    // error.raw holds the wire-format ACK message.
  } else if (error instanceof AckApplicationReject) {
    // MSA-1 = AR — receiver rejected the message.
  } else if (error instanceof MllpClientError) {
    // Transport-level failure: error.code is one of CONNECTION_REFUSED,
    // TIMEOUT, CONNECTION_CLOSED, MALFORMED_FRAME, or MALFORMED_ACK.
  }
}
```

Send over TLS:

```ts
import { readFileSync } from "node:fs";

const client = new MllpClient({
  host: "mllp.example.com",
  port: 6661,
  tls: {
    ca: readFileSync("ca.pem"),
    cert: readFileSync("client-cert.pem"),
    key: readFileSync("client-key.pem"),
  },
});

const ack = await client.send(rawMessage);
```

The same code on **Deno**:

```ts
import { MllpClient } from "@glion/mllp-client/deno";

const client = new MllpClient({ host: "127.0.0.1", port: 2575 });
const ack = await client.send(rawMessage);
```

The same code on **Cloudflare Workers**:

```ts
import { MllpClient } from "@glion/mllp-client/workers";

const client = new MllpClient({ host: "127.0.0.1", port: 2575 });
const ack = await client.send(rawMessage);
```

## Options

`MllpClientOptions`:

| Option       | Type                   | Default | Description                                                             |
| ------------ | ---------------------- | ------- | ----------------------------------------------------------------------- |
| `host`       | `string`               | —       | Hostname or IP of the MLLP server.                                      |
| `port`       | `number`               | —       | TCP port of the MLLP server.                                            |
| `timeout`    | `number`               | `30000` | Maximum total milliseconds for connect → send → ACK.                    |
| `maxAckSize` | `number`               | —       | Maximum bytes accepted for an inbound ACK frame. No limit when omitted. |
| `tls`        | `MllpClientTlsOptions` | —       | TLS configuration. The client connects via TLS when set, plain TCP.     |

`MllpClientTlsOptions`:

| Option       | Type               | Description                                                                                                                                                                 |
| ------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ca`         | `string \| Buffer` | Trusted CA certificate(s) for verifying the server.                                                                                                                         |
| `cert`       | `string \| Buffer` | Client certificate for mutual TLS.                                                                                                                                          |
| `key`        | `string \| Buffer` | Client private key for mutual TLS.                                                                                                                                          |
| `passphrase` | `string`           | Passphrase for the private key.                                                                                                                                             |
| `servername` | `string`           | Server name for SNI and certificate verification. Defaults to `host`. Setting this to anything other than the real hostname disables strict hostname verification.          |
| `insecure`   | `true`             | **Test/dev only.** Disable server-certificate verification. Only the literal value `true` opts out — there is no `false` form because the secure default is non-negotiable. |

## API

### `new MllpClient(options)`

Construct a client bound to a host/port. The constructor does not open a connection — every `send()` call opens its own.

```ts
import { MllpClient } from "@glion/mllp-client";

const client = new MllpClient({ host: "127.0.0.1", port: 2575 });
client.host; // "127.0.0.1"
client.port; // 2575
```

### `client.send(message, options?)`

Send a single HL7v2 message and resolve with the parsed ACK. Accepts a `string` or `Uint8Array` payload. Opens a TCP/TLS connection, writes the MLLP-framed bytes, reads acknowledgment frames until the one selected by `options.waitFor` arrives, parses it, and closes the connection. On NAK (MSA-1 ∈ {AE, AR, CE, CR}), throws the matching `AckException` subclass with the original wire-format ACK on `error.raw`.

```ts
const ack = await client.send(rawHl7Message);
```

`options` is optional:

| Field     | Type                  | Default   | Description                                                                                                    |
| --------- | --------------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| `signal`  | `AbortSignal`         | —         | Cancel the in-flight send. Composed with the client's `timeout` via `AbortSignal.any` so either source aborts. |
| `waitFor` | `"final" \| "commit"` | `"final"` | Which incoming ACK frame should resolve the send. See [Acknowledgment modes](#acknowledgment-modes).           |

### `Acknowledgment`

The HL7v2 acknowledgment returned by `client.send()`.

| Field         | Type                  | Description                                                           |
| ------------- | --------------------- | --------------------------------------------------------------------- |
| `raw`         | `string`              | The raw HL7v2 ACK message as received from the wire.                  |
| `tree`        | `Root`                | The ACK message AST.                                                  |
| `code`        | `string`              | MSA-1 acknowledgment code (`AA`, `AE`, `AR`, `CA`, `CE`, or `CR`).    |
| `controlId`   | `string`              | MSA-2 message control ID — references the original message's MSH-10.  |
| `textMessage` | `string \| undefined` | MSA-3 text message. Present on NAK; optional on ACK.                  |
| `errorCode`   | `string \| undefined` | ERR-3 HL7 error condition code (Table 0357). Present when ERR is set. |
| `severity`    | `string \| undefined` | ERR-4 severity (Table 0516). Present when ERR is set.                 |

### `MllpClientError`

A subclass of `MllpError` from `@glion/mllp-transport`, thrown for transport-level failures. The `code` property identifies the failure mode:

| `code`               | Meaning                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `CONNECTION_REFUSED` | The TCP connection could not be established (refused, DNS, routing). |
| `CONNECTION_CLOSED`  | The peer closed the connection before a complete ACK arrived.        |
| `TIMEOUT`            | No ACK arrived within `timeout`.                                     |
| `MALFORMED_FRAME`    | Bytes received did not form a valid MLLP frame.                      |
| `MALFORMED_ACK`      | The ACK frame was received but could not be parsed as HL7v2.         |

### Application-level NAK exceptions

`MllpClient.send()` throws the same `AckException` subclasses that `@glion/mllp-ack` produces on the receiver side: `AckApplicationError` (AE), `AckApplicationReject` (AR), `AckCommitError` (CE), `AckCommitReject` (CR), and the abstract base `AckException`. They are not re-exported from this package — install `@glion/ack` and import them directly:

```ts
import { AckApplicationError, AckException } from "@glion/ack";
```

Keeping a single import path keeps `@glion/ack` as the authoritative source for the exception hierarchy across both client and server code paths.

## Behavior

### NAK to exception mapping

| MSA-1 | Thrown class           | Source fields                                                                |
| ----- | ---------------------- | ---------------------------------------------------------------------------- |
| `AA`  | — (resolves)           | —                                                                            |
| `CA`  | — (resolves)           | —                                                                            |
| `AE`  | `AckApplicationError`  | `message` ← MSA-3, `errorCode` ← ERR-3, `severity` ← ERR-4, `raw` ← wire ACK |
| `AR`  | `AckApplicationReject` | same                                                                         |
| `CE`  | `AckCommitError`       | same                                                                         |
| `CR`  | `AckCommitReject`      | same                                                                         |

Every thrown `AckException` carries the original raw ACK message on its `raw` attribute. When MSA-3 is empty, the thrown error's `message` defaults to `Acknowledgment <code> from receiver`. When ERR-3 is missing, `errorCode` defaults to `Hl7ErrorCode.ApplicationInternalError` (`207`). When ERR-4 is missing, `severity` defaults to `Severity.Error` (`E`).

### Acknowledgment modes

HL7v2 defines two acknowledgment modes, controlled per call by the `waitFor` option:

- **Basic mode** — the receiver sends a single final ACK (`AA`/`AE`/`AR`) once it has accepted or rejected the message. Most integrations use this.
- **Enhanced mode** (HL7v2 §2.9.2) — the receiver sends a `CA` (Commit Accept) immediately to confirm receipt and follows up with a separate final ACK on the same connection after processing. Used when processing is slow or asynchronous and the sender wants confirmation that bytes were received before the final answer.

`waitFor: "final"` (the default) handles both modes transparently: it consumes any intermediate `CA` frames and resolves on the first frame whose MSA-1 is final. `waitFor: "commit"` resolves on the first frame regardless of code — useful when the receiver only sends commit-level ACKs, or when the caller wants the commit confirmation without waiting for the final result.

```ts
// Default — works for basic and enhanced modes.
const final = await client.send(message); // resolves with AA/AE/AR/CE/CR

// Resolve as soon as the receiver acknowledges receipt.
const commit = await client.send(message, { waitFor: "commit" }); // resolves with CA (or any first frame)
```

The connection is closed after the resolving frame, so callers using `waitFor: "commit"` will not see the receiver's later final ACK — choose this mode only when you do not need the final result.

### Connection lifecycle

`MllpClient` does not pool or reuse connections. Each `send()` opens a fresh TCP/TLS connection and closes it after the ACK frame is read. This trades TCP and TLS handshake overhead for a simpler API and isolates each request from the failure modes of the others. Receivers that require long-lived connections may need a different client.

### Concurrency

Each `send()` is independent. Concurrent calls open independent connections; there is no shared state between in-flight requests.

## Limitations

Things `@glion/mllp-client` deliberately does **not** do — call them out explicitly so callers can decide whether the client fits their integration:

- **No connection pooling or reuse.** Every `send()` opens a fresh socket. High-volume integrations that need to amortise the TCP/TLS handshake should layer their own pool above `send()` (or wait for a future opt-in `Connection` handle).
- **No retry or backoff.** A failed `send()` rejects once. Retry policy is the caller's responsibility — semantics vary too much across HL7v2 deployments to bake one in.
- **No outbound queueing.** The client sends what it is given, immediately. Callers that need rate-limiting or queueing should compose those above `send()`.
- **No streaming response.** `send()` reads frames until the one selected by `waitFor` arrives (a `CA` frame followed by a final ACK is the most you will ever see); any further bytes from the receiver are discarded when the socket is closed. MLLP is request/response, not bidirectional, so this matches the protocol.
- **No outbound message-size limit.** The encoder will frame whatever you pass in. Use `maxAckSize` to cap inbound frames; cap outbound size in your application code if that matters.

## Errors and PHI

Thrown errors carry the full diagnostic context so callers can debug without reaching for additional state. **That context can include HL7v2 message content**:

- `AckException.raw` (from `@glion/ack`) holds the full wire-format ACK that triggered the exception. ACKs typically do not contain protected health information (PHI), but a NAK whose MSA-3 echoes input data can.
- `error.message` on a NAK exception is MSA-3 verbatim, which a misbehaving receiver may populate with patient identifiers, dates of birth, or free-text notes.
- `error.cause` on `MllpClientError(MALFORMED_ACK)` chains the underlying parser error, whose message may include a slice of the unparseable input.

If you log thrown errors to a destination that is not approved for PHI (general-purpose log aggregators, third-party error trackers, terminals shared with non-clinical staff), redact `error.raw`, `error.message`, and `error.cause` first. The package never logs these fields itself — propagation is entirely the caller's choice.

## Part of Glion

`@glion/mllp-client` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
