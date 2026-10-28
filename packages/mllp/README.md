# @glion/mllp

Routes and middleware that response to HL7v2 messages, on any runtime, with an MLLP server for Node.js and Bun.

## What it does

An `Mllp` app routes each HL7v2 message to a handler by message type and trigger event, runs middleware around it, and replies with its acknowledgment. `app.handle(payload, env?)` replies to one message and depends on no runtime: a Cloudflare Worker or an AWS Lambda function calls it with each message it receives. `handleConnection()` runs the MLLP exchange over any socket that exposes Web Streams, and `serve()` from `@glion/mllp/node` listens on a TCP or TLS port and runs it on every connection.

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
import { AckApplicationError, AckCode } from "@glion/ack";
import { Mllp } from "@glion/mllp";
import { serve } from "@glion/mllp/node";

const app = new Mllp()
  // A handler returns its response: ctx.ack() is AA.
  .on("ADT^A01", async (ctx) => {
    await saveToDatabase(ctx.ast);
    return ctx.ack();
  })
  .on("ORM^O01", (ctx) => ctx.ack({ code: AckCode.CommitAccept }))
  // A thrown AckException replies with its code.
  .on("ORU^R01", () => {
    throw new AckApplicationError("No patient with this MRN", {});
  });
// Any other message type is answered AR.

const server = serve({ handle: app.handle, port: 2575 });
```

To run the app with live reload during development and a production start command, use the `@glion/cli` package — it provides the `glion dev` / `glion start` binary and configuration loader. This README focuses on the server primitives themselves.

## API

### `Mllp`

The app. `Mllp<E>` types `ctx.env` as `E`; it defaults to `unknown`. `new Mllp(options?)` takes the options every acknowledgment the app writes uses: the default `AA`, the NAK of a thrown error, and `ctx.ack()`.

| Option       | Type                                             | Description                                                                                                                                                      |
| ------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timeZone`   | `string`, optional                               | IANA time zone MSH-7 is read in, such as `America/New_York`. Defaults to the host's time zone. The constructor throws a `RangeError` for a name that is not one. |
| `delimiters` | `Partial<Omit<Delimiters, "segment">>`, optional | MSH-1 and MSH-2. Each delimiter not given is the standard one: `\|` and `^~\&`.                                                                                  |
| `serializer` | `(tree: Root) => string`, optional               | Writes every response as HL7v2 text. Defaults to `toHl7v2` from `@glion/to-hl7v2`, which encodes each value's escape sequences.                                  |

```ts
const app = new Mllp({ timeZone: "America/New_York" });
```

An app reads each message with `@glion/parser` and `@glion/lint-required-message-header` unless `.parser()` replaces them. An app that checks each message against its profile reads with `parseHL7v2` from `@glion/hl7v2`, and answers `AE` to a message missing a segment or field the profile requires:

```ts
import { parseHL7v2 } from "@glion/hl7v2";

const app = new Mllp().parser(parseHL7v2);
```

An app whose parser keeps escape sequences as received writes its responses without encoding them:

```ts
const app = new Mllp({
  serializer: (tree) => toHl7v2(tree, undefined, { encodeEscapes: false }),
}).parser(
  unified()
    .use(hl7v2Parser, { decodeEscapes: false })
    .use(hl7v2LintRequiredMessageHeader, ["error"])
    .freeze()
);
```

The rest of the API chains:

| Method                      | Description                                                                                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.parser(processor)`        | Replace the `unified` processor that reads each message; by default, `@glion/parser` and `@glion/lint-required-message-header` at `"error"`. It MUST report a fatal message for a message that does not start with an MSH.                                                                              |
| `.use(middleware)`          | Register global middleware that runs for every message.                                                                                                                                                                                                                                                 |
| `.use(pattern, middleware)` | Register scoped middleware that runs only for matching message types.                                                                                                                                                                                                                                   |
| `.on(pattern, handler)`     | Register a terminal route handler for a message type or trigger event.                                                                                                                                                                                                                                  |
| `.onError(handler)`         | Register a handler that observes every error a message raises, when it is raised: a payload that is not UTF-8, a processor throw, the processor's first fatal message, and the error of a route filter, middleware or handler. Each handler registered runs, in order; it does not change the response. |
| `.handle(payload, env?)`    | Reply to one message, given as bytes without MLLP framing; resolves to the response serialized as UTF-8 bytes, or `undefined` for none. `env` becomes `ctx.env`, and is required when `E` excludes `undefined`. Bound to the app.                                                                       |

### `handleConnection(handle, socket, options?)`

Reply to every message on one connection. Reads MLLP frames from `socket.readable`, calls `handle` with each message, one at a time, and writes each response to `socket.writable` with MLLP framing. Resolves once the remote system closes the connection, or `options.signal` aborts; then the message in progress, if any, is answered first. Closes `socket` either way. Rejects with `MllpServerError` `PROTOCOL_VIOLATION` when the bytes break MLLP framing, with what `handle` throws, and with an error `socket`'s streams raise. Once the connection is torn down (a reset, a broken pipe, a timeout), `socket.readable` must end as a close does and a write to `socket.writable` must resolve.

| Argument         | Type                                                        | Description                                                                                                      |
| ---------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `handle`         | `(payload: Uint8Array) => Promise<Uint8Array \| undefined>` | The response to one message, both without MLLP framing; `app.handle`, or a function that calls it with an `env`. |
| `socket`         | `MllpSocket`                                                | `readable` and `writable` Web Streams, and a `close()` that never throws and is idempotent.                      |
| `options.signal` | `AbortSignal`, optional                                     | Ends the connection.                                                                                             |

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

| Option           | Type                                                          | Description                                                                                                                                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handle`         | `(payload, env: NodeEnv) => Promise<Uint8Array \| undefined>` | The response to each message; `app.handle`.                                                                                                                                                                                                                                                                          |
| `port`           | `number`                                                      | TCP port to listen on.                                                                                                                                                                                                                                                                                               |
| `hostname`       | `string`, optional                                            | Interface to bind. Defaults to all interfaces.                                                                                                                                                                                                                                                                       |
| `tls`            | `tls.TlsOptions`, optional                                    | Node's TLS server options, passed to `tls.createServer()` unchanged. Plain TCP without it. See [TLS](#tls).                                                                                                                                                                                                          |
| `maxConnections` | `number`, optional                                            | Most connections open at once; one past it is closed before any message is read. Unlimited when unset. See [Connections](#connections).                                                                                                                                                                              |
| `socketTimeout`  | `number`, optional                                            | Socket inactivity timeout in ms — an idle socket past it is destroyed. `0` (default) disables.                                                                                                                                                                                                                       |
| `onConnect`      | `ConnectionCallback`, optional                                | Called when a new TCP connection is accepted.                                                                                                                                                                                                                                                                        |
| `onDisconnect`   | `ConnectionCallback`, optional                                | Called when a connection closes — always fires, even if `onConnect` threw.                                                                                                                                                                                                                                           |
| `onError`        | `ErrorCallback`, optional                                     | Called when a lifecycle callback throws, `handle` rejects (a `serializer` that throws), the byte stream breaks (`PROTOCOL_VIOLATION`), or the socket fails other than by a reset, a broken pipe or a timeout; the connection closes after the last three. Without it, these errors are not reported. Must not throw. |

### Wire framing

MLLP framing lives in [`@glion/mllp-codec`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp-codec) — `frame()` wraps outbound messages, `unframe()` streams inbound bytes back into them. `@glion/mllp` consumes it internally and re-exports nothing from it; import it directly when you need the codec.

### Types

| Type                      | Description                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Context`                 | Request context with message data and routing fields.                                                                                                                                       |
| `MllpOptions`             | The options of `new Mllp()`: `timeZone` and `delimiters`, as `acknowledge()` takes them, and `serializer`.                                                                                  |
| `ErrorHandler`            | The handler `app.onError()` takes: `(error, env) => Promise<void> \| undefined`, where `env` is what the runtime passed to `handle()`. MUST NOT throw.                                      |
| `MllpResponse`            | A response: an HL7v2 message serialized as UTF-8 (`bytes`), with its MSA-1 (`code`). Built by `ctx.ack()` and `ctx.reply()`.                                                                |
| `AckOptions`              | The options of `ctx.ack()`: those of `acknowledge()` without `timeZone` and `delimiters`, which the app is given, and with an accept code (`AA` or `CA`) in `code`.                         |
| `Hl7v2Processor`          | Unified `Processor` type for HL7v2 (`Processor<Root, Root \| undefined, Root \| undefined>` — head/tail admit `undefined` so the bare `unified().use(hl7v2Parser).freeze()` is assignable). |
| `Middleware`              | Middleware function `(ctx, next) => ...`.                                                                                                                                                   |
| `Handler`                 | Terminal route handler `(ctx) => MllpResponse \| null`: the response, or `null` for none.                                                                                                   |
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

| Code                   | Meaning                                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_RESPONSE`     | A route handler or middleware gave, or wrote to `ctx.res`, a value that is not an `MllpResponse`; the message is answered `AE`.                     |
| `NEXT_CALLED_TWICE`    | A middleware called `next()` a second time; the message is answered as a middleware throw.                                                          |
| `INVALID_OPTION`       | `serve()` was given no `handle` function, or a `port` that is not an integer from 0 to 65535. The error's `option` names which: `handle` or `port`. |
| `PROTOCOL_VIOLATION`   | The MLLP byte stream was violated and the connection closed (the `MllpCodecError` is on `cause`). Raised by `handleConnection()`.                   |
| `RESPONSE_IS_NAK`      | `ctx.ack()` was given a NAK code, or `ctx.reply()` a message whose MSA-1 is one; a NAK is the response to a throw.                                  |
| `RESPONSE_WITHOUT_MSH` | `ctx.reply()` was given a message that does not start with an MSH.                                                                                  |

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

## Replies

A route handler returns its response, an `MllpResponse`. `ctx.ack()` builds the acknowledgment of the message, and `ctx.reply(message)` any other HL7v2 message, such as a query response; both serialize it when called. A response accepts the message: `ctx.ack()` takes `AA` or `CA`, and `ctx.reply()` throws `MllpServerError` `RESPONSE_IS_NAK` for a message whose MSA-1 is a NAK code. A NAK is the response to a throw, so `ctx.error` holds every failure.

| The route handler         | Response                                                      |
| ------------------------- | ------------------------------------------------------------- |
| Returns an `MllpResponse` | That response.                                                |
| Returns `null`            | No response.                                                  |
| Returns anything else     | `AE`; `ctx.error` is an `MllpServerError` `INVALID_RESPONSE`. |
| Throws an `AckException`  | Its `code` in MSA-1.                                          |
| Throws anything else      | `AE`.                                                         |

```ts
import { AckCode } from "@glion/ack";

return ctx.ack(); // AA
return ctx.ack({ code: AckCode.CommitAccept }); // CA
return ctx.reply(response); // an RSP^K22 built with @glion/builder
```

A message no route matches is answered as a thrown `UnsupportedMessageTypeReject`: `AR`. A middleware replaces the response by returning an `MllpResponse`, or `null` for no response, or by writing `ctx.res`, before or after `next()`; one that returns nothing leaves it as it is. A middleware throw is answered the same way as a handler throw, and its NAK replaces the response given before it. A value that is not an `MllpResponse`, returned by a middleware or written to `ctx.res`, is answered `AE` with `INVALID_RESPONSE`.

A route filter that throws runs only the global middleware and is answered as a throw. A payload that is not UTF-8 (`@glion/util-charset` throws a `CharsetError` with `code` `INCOMPATIBLE_CHARSET`), that the processor throws on, or that the processor reports a fatal message for runs no middleware and no route: the response is the NAK of the error, or of the first fatal message, `AE` unless the processor threw an `AckException`. The default processor reports a fatal message for a payload that does not start with an MSH, such as an empty frame. `parseHL7v2` from `@glion/hl7v2` also reports one for each finding of a rule it sets to `"error"`, such as a segment the event schema requires. The NAK answers the MSH read from the bytes before the first CR, so a payload whose MSH is not UTF-8, or that has none, gets no response. An `ACK` gets no response unless a handler or middleware gives one. No response carries MSA-3: an error's `message` and an `AckException`'s `text` are never sent, and the acknowledgment has the same fields in every HL7v2 version.

`ctx.error` holds the latest error the message raised, and the response answers it. An error a middleware throws after the route handler replied replaces that response too: the sender gets the NAK, and may send the message again. A middleware changes the NAK's code by throwing an `AckException` after `next()`, with the error it answers as its `cause`. A `next()` called a second time throws `MllpServerError` `NEXT_CALLED_TWICE`, and is answered as a middleware throw.

The acknowledgment answers the MSH of the tree the processor read, as it is when the acknowledgment is built: a handler that changes the MSH before then changes the acknowledgment too.

An acknowledgment is built by [`acknowledge()`](#acknowledgeorigin-options).

## Middleware

Middleware functions receive the request context and a `next()` callback. Pre-work runs before `next()`; post-work runs after. Returning without calling `next()` short-circuits the handler. `await next()` throws only when called a second time: after it, `ctx.res` is the response and `ctx.error` the error the message raised, if any. A response written after `next()` replaces the NAK of an error, so check `ctx.error` first.

```ts
import { AckApplicationReject } from "@glion/ack";

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

// Short-circuit: throw without calling next().
app.use(async (ctx, next) => {
  if (!isAuthorized(ctx.ast)) {
    throw new AckApplicationReject("Sender not allowed", {});
  }
  await next();
});

// Read the outcome after next(): the response's MSA-1, and the error.
app.use(async (ctx, next) => {
  await next();
  report(ctx.res?.code, ctx.error);
});
```

## Context

Available in every middleware and handler. Before routing, the processor has parsed the message and run its transformers, lint rules among them; compilation waits for `ctx.result()`.

### Sync properties

| Property               | Description                                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ctx.req.raw`          | The payload decoded as UTF-8.                                                                                                                                                                      |
| `ctx.env`              | What the runtime passed to `handle()`: a `NodeEnv` under `serve()`, a Workers environment, or `undefined`.                                                                                         |
| `ctx.messageType`      | MSH-9.1 (e.g. `"ADT"`).                                                                                                                                                                            |
| `ctx.triggerEvent`     | MSH-9.2 (e.g. `"A01"`).                                                                                                                                                                            |
| `ctx.messageStructure` | MSH-9.3 (e.g. `"ADT_A01"`).                                                                                                                                                                        |
| `ctx.version`          | MSH-12 (e.g. `"2.5.1"`).                                                                                                                                                                           |
| `ctx.controlId`        | MSH-10 message control ID.                                                                                                                                                                         |
| `ctx.ast`              | The tree the processor parsed and ran its transformers on.                                                                                                                                         |
| `ctx.file`             | VFile holding the processor's messages; none is fatal.                                                                                                                                             |
| `ctx.set(key, value)`  | Store a variable.                                                                                                                                                                                  |
| `ctx.get(key)`         | Retrieve a variable.                                                                                                                                                                               |
| `ctx.var`              | Read-only snapshot of all variables.                                                                                                                                                               |
| `ctx.error`            | The latest error the message raised, or `undefined`. Read-only.                                                                                                                                    |
| `ctx.res`              | The response, an `MllpResponse`, or `undefined` for none. Writing a value that is not an `MllpResponse` throws `INVALID_RESPONSE`.                                                                 |
| `ctx.ack(options?)`    | The acknowledgment of this message as an `MllpResponse`: `acknowledge()` of its MSH as it is when `ack()` is called, with the app's `timeZone` and `delimiters` and an accept code (`AckOptions`). |
| `ctx.reply(message)`   | `message`, an HL7v2 message as a `Root`, as an `MllpResponse`.                                                                                                                                     |

### Async methods

| Method               | Triggers      | Description                                                                                                                  |
| -------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `await ctx.tree()`   | —             | Resolves to `ctx.ast`.                                                                                                       |
| `await ctx.result()` | `stringify()` | Compiled output (e.g. JSON from `hl7v2Jsonify`), or `undefined` when the processor has no compiler, as the default has none. |

`ctx.result()` is cached: later calls resolve to the same value.

```ts
app.on("ORU^R01", async (ctx) => {
  await saveToDatabase(await ctx.result());
  return ctx.ack();
});
```

## Error handling

`app.onError()` observes every error a message raises, when it is raised; it does not change the response:

```ts
app.onError((error) => {
  logger.error(error);
});
```

`await next()` throws only when called a second time. After it, `ctx.error` is the latest error the message raised and `ctx.res` its response. A middleware answers the error with another NAK by throwing:

```ts
import { AckApplicationReject } from "@glion/ack";

app.use(async (ctx, next) => {
  await next();
  if (ctx.error instanceof UnknownPatient) {
    throw new AckApplicationReject("Unknown patient", { cause: ctx.error });
  }
});
```

Register it with `app.use()` before other middleware so it wraps them all. An error a middleware throws replaces `ctx.error` and the response; the error it answers stays on its `cause`. `serve()`'s `onError` sees no error a message raised.

## Connections

The server accepts any number of connections at once and handles them concurrently. On each connection, messages reach the app one at a time, in the order they arrived, and the server writes the response before it reads the next message. Messages on different connections are not ordered: a sending system that needs its messages processed in order sends them over one connection.

`connection.state` belongs to one connection and is discarded when it closes. `onConnect` and `onDisconnect` fire once per connection.

`maxConnections` limits how many connections are open at once. A connection past the limit is closed as soon as it is accepted, before any message is read, and an open connection is never closed to make room. A connection whose remote system is gone holds its place until keep-alive ends it. With keep-alive turned off in `tls` and no `socketTimeout`, such connections can fill the limit and lock out a sending system that reconnects.

## Socket options

Every connection has TCP keep-alive, with the first probe after 60 s idle, and Nagle's algorithm off. Keep-alive ends a connection whose remote system is gone without closing it; `socketTimeout` also ends one whose remote system is there but quiet.

## TLS

`tls` takes Node's [TLS server options](https://nodejs.org/api/tls.html#tlscreateserveroptions-secureconnectionlistener) and passes them to `tls.createServer()` unchanged; a [socket option](#socket-options) set in `tls` replaces the server's. Each connection reaches the app once its TLS handshake completes. Without `tls`, the server listens with `net.createServer()`.

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
  return ctx.ack();
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

### Why no built-in logging?

The core has zero `console.log` or `console.error` calls. Logging is an opt-in middleware concern, giving you full control over format, destination, and verbosity without the core making assumptions about your observability stack.

## Part of Glion

`@glion/mllp` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
