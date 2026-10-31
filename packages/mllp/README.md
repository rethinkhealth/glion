# @glion/mllp

Routes and middleware that respond to HL7v2 messages, on any runtime, with an MLLP server for Node.js and Bun.

## What it does

An `Mllp` app routes each HL7v2 message to a handler by message type and trigger event, and runs middleware around it. `app.handle(payload, env?)` replies to one message and depends on no runtime: a Cloudflare Worker or an AWS Lambda function calls it with each message it receives. `handleConnection()` runs the MLLP exchange over any socket that exposes Web Streams, and `serve()` from `@glion/mllp/node` listens on a TCP or TLS port and runs it on every connection.

## Install

```bash
npm install @glion/mllp
```

### Package exports

| Subpath            | Description                                                  |
| ------------------ | ------------------------------------------------------------ |
| `@glion/mllp`      | `Mllp`, `handleConnection()`, `acknowledge()`; Web APIs only |
| `@glion/mllp/node` | `serve()`, the TCP and TLS server for Node.js and Bun        |

## Use

```ts
import { Mllp } from "@glion/mllp";
import { serve } from "@glion/mllp/node";

const app = new Mllp()
  .on("ADT^A01", async (ctx) => ({ raw: buildAckFor(ctx) }))
  .on("ORU^R01", async (ctx) => ({ raw: buildAckFor(ctx) }))
  .on("*", async (ctx) => ({
    raw: buildNakFor(ctx, "Unsupported message type"),
  }));

const server = serve({ handle: app.handle, port: 2575 });
```

To run the app with live reload during development and a production start command, use the `@glion/cli` package — it provides the `glion dev` / `glion start` binary and configuration loader. This README focuses on the server primitives themselves.

## API

### `Mllp`

The app. `Mllp<E>` types `ctx.env` as `E`; it defaults to `unknown`.

An app reads each message with `@glion/parser` and `@glion/lint-required-message-header` unless `.parser()` replaces them. An app that checks each message against its profile reads with `parseHL7v2` from `@glion/hl7v2`; `handle()` then rejects a message missing a segment or field the profile requires:

```ts
import { parseHL7v2 } from "@glion/hl7v2";

const app = new Mllp().parser(parseHL7v2);
```

Built with a fluent chainable API:

| Method                      | Description                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.parser(processor)`        | Replace the `unified` processor that reads each message; by default, `@glion/parser` and `@glion/lint-required-message-header` at `"error"`. It MUST report a fatal message for a message that does not start with an MSH.     |
| `.use(middleware)`          | Register global middleware that runs for every message.                                                                                                                                                                        |
| `.use(pattern, middleware)` | Register scoped middleware that runs only for matching message types.                                                                                                                                                          |
| `.on(pattern, handler)`     | Register a terminal route handler for a message type or trigger event.                                                                                                                                                         |
| `.onError(errorHandler)`    | Register a catch-all error handler.                                                                                                                                                                                            |
| `.handle(payload, env?)`    | Reply to one message, given as bytes without MLLP framing; resolves to the response's `raw` as UTF-8 bytes, or `undefined` for none. `env` becomes `ctx.env`, and is required when `E` excludes `undefined`. Bound to the app. |

### `handleConnection(handle, socket, options?)`

Reply to every message on one connection. Reads MLLP frames from `socket.readable`, calls `handle` with each message, one at a time, and writes each response to `socket.writable` with MLLP framing. Resolves once the remote system closes the connection, the connection is lost, or `options.signal` aborts. An abort stops the reading: the message in progress, if any, is answered first, and a message not yet read in full is dropped without being reported. Closes `socket` either way. Rejects with `MllpServerError` `PROTOCOL_VIOLATION` when the remote system's bytes break MLLP framing, with `UNFRAMEABLE_RESPONSE` when a response carries a VT or FS byte, with what `handle` throws, and with an error `socket`'s streams raise. `socket.writable` must keep accepting writes after `socket.readable` ends or is cancelled, until `close()`, and cancelling `socket.readable` must not end the socket. Once the connection is torn down (a reset, a broken pipe, a timeout), `socket.readable` must error with `MllpServerError` `CONNECTION_LOST` and a write to `socket.writable` must resolve; the messages still in transit are not handled.

| Argument         | Type                                                        | Description                                                                                                      |
| ---------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `handle`         | `(payload: Uint8Array) => Promise<Uint8Array \| undefined>` | The response to one message, both without MLLP framing; `app.handle`, or a function that calls it with an `env`. |
| `socket`         | `MllpSocket`                                                | `readable` and `writable` Web Streams, and a `close()` that never throws and is idempotent.                      |
| `options.signal` | `AbortSignal`, optional                                     | Stops reading, answers the message in progress, then ends the connection.                                        |

```ts
import { handleConnection } from "@glion/mllp";

await handleConnection((payload) => app.handle(payload, env), socket, {
  signal,
});
```

### `acknowledge(origin, options?)`

Returns the acknowledgment of the parsed message `origin` as a `Root`: an MSH and an MSA segment. MSH-1 and MSH-2 declare the `delimiters` option, never the original message's delimiters. The MSH swaps the original sender and receiver (MSH-3/4 ↔ MSH-5/6), each field copied whole, sets MSH-7 to the current time to the second in the `timeZone` option, with that zone's offset from UTC, and MSH-9 to `ACK^<MSH-9.2>^ACK` (`ACK^<MSH-9.2>` before v2.3.1), and echoes MSH-12.1. The MSA holds MSA-1 and MSA-2, which echoes the original MSH-10. It never contains MSA-3 or an ERR segment, so the acknowledgment has the same fields in every HL7v2 version.

| Option         | Type                                             | Description                                                                                                                                                                                    |
| -------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`         | `AckCode`, optional                              | MSA-1. Defaults to `AA`.                                                                                                                                                                       |
| `id`           | `string`, optional                               | MSH-10. Defaults to a fresh `uid()`.                                                                                                                                                           |
| `sending`      | `{ application, facility }`, optional            | MSH-3.1 and MSH-4.1. Default to the original MSH-5 and MSH-6, copied whole.                                                                                                                    |
| `processingId` | `string`, optional                               | MSH-11. Defaults to the original MSH-11, copied whole, else `P`.                                                                                                                               |
| `delimiters`   | `Partial<Omit<Delimiters, "segment">>`, optional | MSH-1 and MSH-2. Each delimiter not given is the standard one: `\|` and `^~\&`.                                                                                                                |
| `timeZone`     | `string`, optional                               | IANA time zone MSH-7 is read in, such as `America/New_York`. Defaults to the host's time zone; `UTC` gives the offset `-0000`. Throws a `RangeError` for a name that is not an IANA time zone. |

```ts
import { AckCode } from "@glion/ack";
import { acknowledge } from "@glion/mllp";
import { toHl7v2 } from "@glion/to-hl7v2";

toHl7v2(acknowledge(ctx.ast, { code: AckCode.ApplicationReject }));
// MSH|^~\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000-0500||ACK^A01^ACK|<uid>|P|2.5.1
// MSA|AR|MSG001
```

### `serve(options)` — from `@glion/mllp/node`

Start a Node.js or Bun TCP server that runs `handleConnection()` on every connection it accepts. Each message reaches `handle` with a `NodeEnv`, `{ connection }`, where `connection` is a `ConnectionInfo`: `id`, `remoteAddress`, `remotePort`, `localPort`, `secure`, and a `state` map kept across the messages of the connection.

| Option           | Type                                                          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `handle`         | `(payload, env: NodeEnv) => Promise<Uint8Array \| undefined>` | The response to each message; `app.handle`.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `port`           | `number`                                                      | TCP port to listen on.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `hostname`       | `string`, optional                                            | Interface to bind. Defaults to all interfaces.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `tls`            | `tls.TlsOptions`, optional                                    | Node's TLS server options, passed to `tls.createServer()`; `allowHalfOpen` stays on. Plain TCP without it. See [TLS](#tls).                                                                                                                                                                                                                                                                                                                                                          |
| `maxConnections` | `number`, optional                                            | Most connections open at once; one past it is closed before any message is read. Unlimited when unset. See [Connections](#connections).                                                                                                                                                                                                                                                                                                                                              |
| `socketTimeout`  | `number`, optional                                            | Socket inactivity timeout in ms — an idle socket past it is destroyed. `0` (default) disables.                                                                                                                                                                                                                                                                                                                                                                                       |
| `onConnect`      | `ConnectionCallback`, optional                                | Called when a new TCP connection is accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `onDisconnect`   | `ConnectionCallback`, optional                                | Called when a connection closes — always fires, even if `onConnect` threw.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `onError`        | `ErrorCallback`, optional                                     | Called when a lifecycle callback throws, `handle` rejects (with the message's `MessageInfo`; the message gets no reply and the connection stays open), the byte stream breaks (`PROTOCOL_VIOLATION`), a response carries a VT or FS byte (`UNFRAMEABLE_RESPONSE`), or the socket fails other than by a reset, a broken pipe or a timeout; the connection closes after the last three. Without it, or when it throws, `console.error` logs the error's message and the connection ID. |

### Wire framing

MLLP framing lives in [`@glion/mllp-codec`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp-codec) — `frame()` wraps outbound messages, `unframe()` streams inbound bytes back into them. `@glion/mllp` consumes it internally and re-exports nothing from it; import it directly when you need the codec.

### Types

| Type                      | Description                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Context`                 | The context of one message: the request (`req`), the response (`res`), and what the app adds.                                                                                               |
| `MllpRequest`             | The message that arrived: `raw`, `tree`, `file`, `header` and `result()`.                                                                                                                   |
| `MessageHeader`           | The MSH fields that control processing, as `ctx.req.header` holds them.                                                                                                                     |
| `Response`                | Response object `{ raw: string }`.                                                                                                                                                          |
| `Hl7v2Processor`          | Unified `Processor` type for HL7v2 (`Processor<Root, Root \| undefined, Root \| undefined>` — head/tail admit `undefined` so the bare `unified().use(hl7v2Parser).freeze()` is assignable). |
| `Middleware`              | Middleware function `(ctx, next) => ...`.                                                                                                                                                   |
| `Handler`                 | Terminal route handler `(ctx) => Response`.                                                                                                                                                 |
| `ErrorHandler`            | Error handler `(err, ctx) => Response`.                                                                                                                                                     |
| `RouteFilter`             | Filter function `(ctx) => boolean` used for routing.                                                                                                                                        |
| `MiddlewareReturn`        | Return type of middleware functions.                                                                                                                                                        |
| `RoutePattern`            | Parsed route pattern.                                                                                                                                                                       |
| `EnvArgs`                 | The `env` argument of `handle()`: optional when `E` admits `undefined`.                                                                                                                     |
| `MllpSocket`              | The socket `handleConnection()` takes.                                                                                                                                                      |
| `HandleConnectionOptions` | The options `handleConnection()` takes.                                                                                                                                                     |
| `NodeEnv`                 | From `@glion/mllp/node`: `ctx.env` under `serve()`.                                                                                                                                         |
| `ConnectionInfo`          | From `@glion/mllp/node`: a connection `serve()` accepted.                                                                                                                                   |

### Errors

Server-side failures are raised (or passed to `onError`) as `MllpServerError` — branch on its stable `code`; the underlying codec or charset error rides on `cause`:

| Code                   | Meaning                                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONNECTION_LOST`      | The connection was torn down (a reset, a broken pipe, a timeout). A socket's `readable` errors with it, and `handleConnection()` then resolves.                                               |
| `INVALID_OPTION`       | `serve()` was given an app as its options, no `handle` function, or a `port` that is not an integer from 0 to 65535. The error's `option` names which: `options`, `handle` or `port`.         |
| `PROTOCOL_VIOLATION`   | The MLLP byte stream was violated and the connection closed (the `MllpCodecError` is on `cause`). Raised by `handleConnection()`.                                                             |
| `UNFRAMEABLE_RESPONSE` | A response given to the connection contains a VT or FS byte, which MLLP reserves for framing, and the connection closed (the `MllpCodecError` is on `cause`). Raised by `handleConnection()`. |

## Routing

Register routes by message type, trigger event, or pattern:

```ts
app.on("ADT^A01", handler); // exact match
app.on("ADT^*", handler); // any ADT trigger event
app.on("*^A01", handler); // any message type with A01
app.on("ADT", handler); // any ADT (same as ADT^*)
app.on("*", handler); // catch-all
```

Routes are matched first-match-wins — register specific routes before catch-alls.

## Middleware

Middleware functions receive the request context and a `next()` callback. Pre-work runs before `next()`; post-work runs after. Returning a response from any middleware short-circuits the handler.

```ts
// Global middleware — runs for every message.
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(`Processed in ${Date.now() - start}ms`);
});

// Scoped middleware — only for matching message types.
app.use("ADT^*", async (ctx, next) => {
  ctx.set("isAdmission", true);
  await next();
});

// Short-circuit: return a response without calling next().
app.use(async (ctx) => {
  if (!isAuthorized(ctx.req.tree)) {
    return { raw: buildNakFor(ctx, "Unauthorized") };
  }
});
```

## Context

Available in every middleware and handler. `ctx.req` is the message that arrived, `ctx.res` the response going back, and the rest is the app's.

### Request

Before routing, the processor has parsed the message and run its transformers, lint rules among them. A payload that is not UTF-8, that the processor throws on, or that the processor reports a fatal message for runs no middleware and no route: `handle()` rejects with the `CharsetError` of `@glion/util-charset`, the processor's error, or the first fatal message. The default processor reports a fatal message for a payload that does not start with an MSH, such as an empty frame. `parseHL7v2` from `@glion/hl7v2` also reports one for each finding of a rule it sets to `"error"`, such as a segment the event schema requires.

| Property                 | Description                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ctx.req.raw`            | The payload decoded as UTF-8.                                                                                                                                                                                                                                                                                                                                         |
| `ctx.req.tree`           | The tree the processor parsed and ran its transformers on.                                                                                                                                                                                                                                                                                                            |
| `ctx.req.file`           | VFile holding the processor's messages; none is fatal.                                                                                                                                                                                                                                                                                                                |
| `ctx.req.header`         | The MSH fields that control processing, read before routing: `messageCode` (MSH-9.1), `triggerEvent` (MSH-9.2), `messageStructure` (MSH-9.3), `controlId` (MSH-10), `processingId` (MSH-11.1), `version` (MSH-12.1), `acceptAckType` (MSH-15) and `applicationAckType` (MSH-16). An absent field is an empty string; a change to `ctx.req.tree` does not change them. |
| `await ctx.req.result()` | Compiled output (e.g. JSON from `hl7v2Jsonify`), or `undefined` when the processor has no compiler, as the default has none. Runs `stringify()` once; later calls resolve to the same value.                                                                                                                                                                          |

```ts
import { value } from "@glion/util-query";

app.on("ORU^R01", async (ctx) => {
  // Any other field: read the tree with @glion/util-query.
  const mrn = value(ctx.req.tree, "PID.3.1")?.value;
  await saveToDatabase(mrn, await ctx.req.result());
  return { raw: buildAckFor(ctx) };
});
```

### Response and app

| Property              | Description                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ctx.env`             | What the runtime passed to `handle()`: a `NodeEnv` under `serve()`, a Workers environment, or `undefined`. |
| `ctx.set(key, value)` | Store a variable.                                                                                          |
| `ctx.get(key)`        | Retrieve a variable.                                                                                       |
| `ctx.var`             | Read-only snapshot of all variables.                                                                       |
| `ctx.res`             | Response to send back. Set by middleware or handler.                                                       |

## Error handling

```ts
app.onError(async (err, ctx) => {
  console.error(`Error processing ${ctx.req.header.controlId}:`, err.message);
  return { raw: buildNakFor(ctx, err.message) };
});
```

Without an error handler, errors are absorbed and no response is sent. The sending system will time out and retry per standard MLLP behaviour. See the [design notes](#design-notes) below for the rationale.

## Connections

The server accepts any number of connections at once and handles them concurrently. On each connection, messages reach the app one at a time, in the order they arrived, and the server writes the reply before it reads the next message. Messages on different connections are not ordered: a sending system that needs its messages processed in order sends them over one connection.

`connection.state` belongs to one connection and is discarded when it closes. `onConnect` and `onDisconnect` fire once per connection.

`maxConnections` limits how many connections are open at once. A connection past the limit is closed as soon as it is accepted, before any message is read, and an open connection is never closed to make room. A connection whose remote system is gone holds its place until keep-alive ends it. With keep-alive turned off in `tls` and no `socketTimeout`, such connections can fill the limit and lock out a sending system that reconnects.

## Socket options

Every connection has TCP keep-alive, with the first probe after 60 s idle, and Nagle's algorithm off. Keep-alive ends a connection whose remote system is gone without closing it; `socketTimeout` also ends one whose remote system is there but quiet. The server's side of a connection stays open after the remote system closes its own (`allowHalfOpen`), until every message it sent is answered.

## TLS

`tls` takes Node's [TLS server options](https://nodejs.org/api/tls.html#tlscreateserveroptions-secureconnectionlistener) and passes them to `tls.createServer()`; a [socket option](#socket-options) set in `tls` replaces the server's, except `allowHalfOpen`, which stays on. Each connection reaches the app once its TLS handshake completes. Without `tls`, the server listens with `net.createServer()`.

```ts
import fs from "node:fs";
import { Mllp } from "@glion/mllp";
import { serve } from "@glion/mllp/node";

const app = new Mllp();

const server = serve({
  handle: app.handle,
  port: 2575,
  tls: {
    cert: fs.readFileSync("cert.pem"),
    key: fs.readFileSync("key.pem"),
  },
});
```

Mutual TLS is `requestCert` with the `ca` that issued the client certificates. A remote system that presents no certificate is refused during the handshake. One with a certificate `ca` does not verify is disconnected once the handshake completes, before any message is read:

```ts
const server = serve({
  handle: app.handle,
  port: 2575,
  tls: {
    ca: fs.readFileSync("ca.pem"),
    cert: fs.readFileSync("cert.pem"),
    key: fs.readFileSync("key.pem"),
    requestCert: true,
  },
});
```

## Runtimes

`@glion/mllp` uses Web APIs only; `@glion/mllp/node` holds everything specific to Node.js.

| Runtime                        | Entry point                                                        |
| ------------------------------ | ------------------------------------------------------------------ |
| Node.js, Bun                   | `serve({ handle: app.handle, port })`                              |
| A Web Streams socket           | `handleConnection(app.handle, socket)`                             |
| Cloudflare Workers, AWS Lambda | `app.handle(payload, env)`, once per message the function receives |

A Worker passes its bindings as `env`, typed by `Mllp<Env>`:

```ts
import { Mllp } from "@glion/mllp";

const app = new Mllp<Env>().on("ADT^A01", async (ctx) => {
  await ctx.env.ADMISSIONS.send(ctx.req.raw);
  return { raw: buildAckFor(ctx) };
});

export default {
  async fetch(request: Request, env: Env) {
    const bytes = await app.handle(
      new Uint8Array(await request.arrayBuffer()),
      env
    );
    return new Response(bytes ?? null);
  },
};
```

## Design notes

### Why no default error response?

HL7v2 has no universal error-response format. An ACK/NAK is version-dependent, varies by message type, and requires access to the inbound MSH segment to construct correctly. Building that into the core would couple the routing engine to HL7v2 message construction — the wrong layer of abstraction.

Instead, the `Mllp` engine is middleware-first:

- **Default behaviour** — no response is sent; the sending system times out and retries, which is valid MLLP behaviour.
- **Logging** — add a logger middleware to make errors observable.
- **ACK/NAK** — register your own acknowledgment middleware to translate outcomes into ACK/NAK responses. Built-in acknowledgment translation at the framework's error boundary is landing next (see ADR-0019).
- **Custom error responses** — use `app.onError()` for application-specific handling.

```ts
const app = new Mllp();

app.use(logger()); // observability — provided by middleware

app.on("ADT^A01", handler);
```

### Why no built-in logging?

The core has zero `console.log` or `console.error` calls. Logging is an opt-in middleware concern, giving you full control over format, destination, and verbosity without the core making assumptions about your observability stack.

## Part of Glion

`@glion/mllp` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
