# @glion/mllp

Transport-agnostic MLLP engine and middleware-driven MLLP server for HL7v2 messaging.

## What it does

`@glion/mllp` provides everything you need to send and receive HL7v2 messages over MLLP/TCP: frame encoding and decoding primitives, streaming TransformStreams for chunked TCP, and an `Mllp` class with pattern-based routing, composable middleware, and first-class `unified` processor integration. The server is transport-agnostic at its core and ships with a `serve()` helper for Node.js and Bun.

## Install

```bash
npm install @glion/mllp
```

### Package exports

| Subpath            | Description                       |
| ------------------ | --------------------------------- |
| `@glion/mllp`      | Core `Mllp` class and primitives  |
| `@glion/mllp/node` | `serve()` helper for Node and Bun |

## Use

```ts
import { AckApplicationError, AckCode } from "@glion/ack";
import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";
import { serve } from "@glion/mllp/node";

const app = new Mllp()
  .parser(parseHL7v2)
  // Returning nothing replies AA.
  .on("ADT^A01", async (ctx) => {
    await saveToDatabase(await ctx.result());
  })
  // ctx.ack() builds the reply.
  .on("ORM^O01", (ctx) => ctx.ack({ code: AckCode.CommitAccept }))
  // A thrown AckException replies with its code and text.
  .on("ORU^R01", () => {
    throw new AckApplicationError("No patient with this MRN", {
      text: "Patient not on file",
    });
  });
// Any other message type is answered AR.

const server = serve(app, { port: 2575 });
```

To run the app with live reload during development and a production start command, use the `@glion/cli` package — it provides the `glion dev` / `glion start` binary and configuration loader. This README focuses on the server primitives themselves.

## API

### `Mllp`

The server class. Built with a fluent chainable API:

| Method                      | Description                                                                 |
| --------------------------- | --------------------------------------------------------------------------- |
| `.parser(processor)`        | Attach a `unified` processor (or `@glion/parser` alone) as the parse stage. |
| `.use(middleware)`          | Register global middleware that runs for every message.                     |
| `.use(pattern, middleware)` | Register scoped middleware that runs only for matching message types.       |
| `.on(pattern, handler)`     | Register a terminal route handler for a message type or trigger event.      |

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

### `serve(app, options)` — from `@glion/mllp/node`

Start a Node.js or Bun TCP server that dispatches incoming MLLP frames through the `Mllp` instance.

| Option           | Type                           | Description                                                                                                                             |
| ---------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `port`           | `number`                       | TCP port to listen on.                                                                                                                  |
| `hostname`       | `string`, optional             | Interface to bind. Defaults to all interfaces.                                                                                          |
| `tls`            | `tls.TlsOptions`, optional     | Node's TLS server options, passed to `tls.createServer()` unchanged. Plain TCP without it. See [TLS](#tls).                             |
| `maxConnections` | `number`, optional             | Most connections open at once; one past it is closed before any message is read. Unlimited when unset. See [Connections](#connections). |
| `socketTimeout`  | `number`, optional             | Socket inactivity timeout in ms — an idle socket past it is destroyed. `0` (default) disables.                                          |
| `onConnect`      | `ConnectionCallback`, optional | Called when a new TCP connection is accepted.                                                                                           |
| `onDisconnect`   | `ConnectionCallback`, optional | Called when a connection closes — always fires, even if `onConnect` threw.                                                              |
| `onError`        | `ErrorCallback`, optional      | Called when a lifecycle callback throws, `app.handle()` rejects (`NO_PARSER`), or the byte stream breaks (`PROTOCOL_VIOLATION`).        |

### Wire framing

MLLP framing lives in [`@glion/mllp-codec`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp-codec) — `frame()` wraps outbound messages, `unframe()` streams inbound bytes back into them. `@glion/mllp` consumes it internally and re-exports nothing from it; import it directly when you need the codec.

### Types

| Type               | Description                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Context`          | Request context with message data and routing fields.                                                                                                                                       |
| `Response`         | Response object `{ raw: string }`.                                                                                                                                                          |
| `Hl7v2Processor`   | Unified `Processor` type for HL7v2 (`Processor<Root, Root \| undefined, Root \| undefined>` — head/tail admit `undefined` so the bare `unified().use(hl7v2Parser).freeze()` is assignable). |
| `Middleware`       | Middleware function `(ctx, next) => ...`.                                                                                                                                                   |
| `Handler`          | Terminal route handler `(ctx) => Response \| void`; returning nothing replies `AA`.                                                                                                         |
| `RouteFilter`      | Filter function `(ctx) => boolean` used for routing.                                                                                                                                        |
| `MiddlewareReturn` | Return type of middleware functions.                                                                                                                                                        |
| `ConnectionInfo`   | Connection metadata (ID, remote/local address, TLS flag, per-connection `state`).                                                                                                           |
| `RoutePattern`     | Parsed route pattern.                                                                                                                                                                       |

### Errors

Server-side failures are raised (or passed to `onError`) as `MllpServerError` — branch on its stable `code`; the underlying codec or charset error rides on `cause`:

| Code                   | Meaning                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `NEXT_CALLED_TWICE`    | A middleware called `next()` a second time; the message is answered as a middleware throw.        |
| `NO_PARSER`            | `app.handle()` ran before a parser was registered via `app.parser()`.                             |
| `INCOMPATIBLE_CHARSET` | An inbound message could not be decoded as UTF-8 (the `CharsetError` is on `cause`).              |
| `PROTOCOL_VIOLATION`   | The MLLP byte stream was violated and the connection closed (the `MllpCodecError` is on `cause`). |

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

The reply is the acknowledgment the route handler's outcome describes:

| The route handler                     | Reply                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| Returns nothing, or not a response    | `AA`.                                                                         |
| Returns a response, or sets `ctx.res` | That response.                                                                |
| Throws an `AckException`              | Its `code` in MSA-1 and its `text` in MSA-3; MSA-3 is omitted without `text`. |
| Throws anything else                  | `AE` with MSA-3 `Application internal error`.                                 |

A message no route matches is answered as a thrown `AckApplicationReject` with `text` `Unsupported message type`: `AR`. A middleware throw is answered the same way as a handler throw, unless the route handler or a middleware has returned a reply; then that reply stands. A reply a middleware writes to `ctx.res`, before or after `next()`, stands until an error replaces it. A middleware that returns a response without calling `next()` replies with it; one that returns nothing sends no reply.

A route filter that throws runs only the global middleware and is answered as a throw. A payload that is not UTF-8 (`MllpServerError` `INCOMPATIBLE_CHARSET`) or that the parser throws on runs only the global middleware, and is answered `AE` whatever they return or write: a message whose content was never read is never accepted. An `ACK`, and a payload that does not start with an MSH such as an empty frame, get no reply unless a handler or middleware gives one. An error's `message` is never sent.

`ctx.error` holds the latest error the message raised, and the reply answers the first. A middleware that throws once `ctx.error` holds an error replaces it; to keep it, pass it as the new error's `cause`. A `next()` called a second time throws `MllpServerError` `NEXT_CALLED_TWICE`, and is answered as a middleware throw.

The acknowledgment answers the MSH as the app's parser read it: the transforms `ctx.tree()` runs do not change it. A payload that did not decode or parse has no tree; the acknowledgment answers its first segment, parsed alone.

An acknowledgment is built by [`acknowledge()`](#acknowledgeorigin-options).

## Middleware

Middleware functions receive the request context and a `next()` callback. Pre-work runs before `next()`; post-work runs after. Returning a response from any middleware short-circuits the handler. `await next()` throws only when called a second time: after it, `ctx.res` is the reply and `ctx.error` the error the message raised, if any. A reply written after `next()` replaces the NAK of an error, so check `ctx.error` first.

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
app.use(async (ctx, next) => {
  if (!isAuthorized(ctx.connection.remoteAddress)) {
    return ctx.ack({ code: AckCode.ApplicationReject, text: "Unauthorized" });
  }
  await next();
});

// Read the outcome after next().
app.use(async (ctx, next) => {
  await next();
  if (ctx.error) {
    report(ctx.error);
  }
});
```

## Context

Available in every middleware and handler. The pipeline is lazy: only the decode and parse steps run eagerly; transforms and compilation are deferred until accessed.

### Sync properties

| Property               | Description                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `ctx.req.raw`          | The payload decoded as UTF-8; empty when it is not UTF-8.                                                          |
| `ctx.req.bytes`        | Raw bytes from the MLLP frame.                                                                                     |
| `ctx.connection`       | `{ id, remoteAddress, remotePort, localPort, secure, state }`.                                                     |
| `ctx.messageType`      | MSH-9.1 (e.g. `"ADT"`). The routing fields are read from the MSH when the payload does not decode or parse.        |
| `ctx.triggerEvent`     | MSH-9.2 (e.g. `"A01"`).                                                                                            |
| `ctx.messageStructure` | MSH-9.3 (e.g. `"ADT_A01"`).                                                                                        |
| `ctx.version`          | MSH-12 (e.g. `"2.5.1"`).                                                                                           |
| `ctx.controlId`        | MSH-10 message control ID.                                                                                         |
| `ctx.ast`              | Raw parsed AST — pre-transform, straight from the wire.                                                            |
| `ctx.file`             | VFile (diagnostics accumulate after `tree()`).                                                                     |
| `ctx.set(key, value)`  | Store a variable.                                                                                                  |
| `ctx.get(key)`         | Retrieve a variable.                                                                                               |
| `ctx.var`              | Read-only snapshot of all variables.                                                                               |
| `ctx.error`            | The latest error the message raised, or `undefined`. Read-only.                                                    |
| `ctx.ack(options?)`    | The acknowledgment of this message as a reply: `acknowledge()` of its MSH as the app's parser read it, serialized. |

### Async methods

| Method               | Triggers                | Description                                      |
| -------------------- | ----------------------- | ------------------------------------------------ |
| `await ctx.tree()`   | `run()` (transform)     | Transformed AST — annotations, lint, grouping.   |
| `await ctx.result()` | `run()` + `stringify()` | Compiled output (e.g. JSON from `hl7v2Jsonify`). |

Both are cached — subsequent calls return the same value instantly.

### `ctx.ast` vs `await ctx.tree()`

Use `ctx.ast` when the parsed message is enough — reading MSH fields, building ACK/NAK responses, route filter functions, or middleware that doesn't need annotations. The parser has already decoded escape sequences, so every value is content:

```ts
// Fast — no pipeline cost.
app.use((ctx, next) => {
  console.log(`Received ${ctx.messageType}^${ctx.triggerEvent}`);
  return next();
});
```

Use `await ctx.tree()` when you need the fully processed tree — handlers that inspect annotations, lint findings, or resolved message structures:

```ts
// Triggers transform pipeline on first call.
app.on("ADT^A01", async (ctx) => {
  const tree = await ctx.tree();
  // tree has annotations, message structure resolved, etc.
});
```

Use `await ctx.result()` when you need the compiled output:

```ts
app.on("ORU^R01", async (ctx) => {
  const json = await ctx.result(); // triggers transform + compile
  await saveToDatabase(json);
});
```

### Writing middleware — prefer `ctx.ast`

Most middleware only needs routing fields or raw MSH data — both available synchronously from `ctx.ast`. Reach for `await ctx.tree()` only when you genuinely need the transformed tree.

```ts
// Good — sync, fast, no pipeline cost.
function authMiddleware(): Middleware {
  return (ctx, next) => {
    if (!isAuthorized(ctx.connection.remoteAddress)) {
      return ctx.ack({ code: AckCode.ApplicationReject, text: "Unauthorized" });
    }
    return next();
  };
}

// Only when needed — triggers transform pipeline.
function validationMiddleware(): Middleware {
  return async (ctx, next) => {
    const tree = await ctx.tree();
    if (!isValid(tree)) {
      return ctx.ack({ code: AckCode.ApplicationError, text: "Invalid" });
    }
    return next();
  };
}
```

## Error handling

`await next()` throws only when called a second time. After it, `ctx.error` is the error the message raised and `ctx.res` its reply. A middleware logs the error there, and may replace the reply:

```ts
import { AckCode } from "@glion/ack";

app.use(async (ctx, next) => {
  await next();
  if (ctx.error) {
    logger.error(ctx.error);
  }
  if (ctx.error instanceof DatabaseUnavailable) {
    ctx.res = ctx.ack({
      code: AckCode.ApplicationError,
      text: "Try again later",
    });
  }
});
```

Register it with `app.use()` before other middleware so it wraps them all. An error a middleware throws once `ctx.error` holds one replaces it, and the reply still answers the first; pass the first as the new error's `cause` to keep it. `onError` sees no error a message raised.

## Connections

The server accepts any number of connections at once and handles them concurrently. On each connection, messages reach the app one at a time, in the order they arrived, and the server writes the reply before it reads the next message. Messages on different connections are not ordered: a sending system that needs its messages processed in order sends them over one connection.

`connection.state` belongs to one connection and is discarded when it closes. `onConnect` and `onDisconnect` fire once per connection.

`maxConnections` limits how many connections are open at once. A connection past the limit is closed as soon as it is accepted, before any message is read, and an open connection is never closed to make room. A connection whose remote system is gone holds its place until keep-alive ends it. With keep-alive turned off in `tls` and no `socketTimeout`, such connections can fill the limit and lock out a sending system that reconnects.

## Socket options

Every connection has TCP keep-alive, with the first probe after 60 s idle, and Nagle's algorithm off. Keep-alive ends a connection whose remote system is gone without closing it; `socketTimeout` also ends one whose remote system is there but quiet.

## TLS

`tls` takes Node's [TLS server options](https://nodejs.org/api/tls.html#tlscreateserveroptions-secureconnectionlistener) and passes them to `tls.createServer()` unchanged; a [socket option](#socket-options) set in `tls` replaces the server's. Each connection reaches the app once its TLS handshake completes. Without `tls`, the server listens with `net.createServer()`.

```ts
import fs from "node:fs";
import { Mllp } from "@glion/mllp";
import { parseHL7v2 } from "@glion/hl7v2";
import { serve } from "@glion/mllp/node";

const app = new Mllp().parser(parseHL7v2);

const server = serve(app, {
  port: 2575,
  tls: {
    cert: fs.readFileSync("cert.pem"),
    key: fs.readFileSync("key.pem"),
  },
});
```

Mutual TLS is `requestCert` with the `ca` that issued the client certificates. A remote system that presents no certificate is refused during the handshake. One with a certificate `ca` does not verify is disconnected once the handshake completes, before any message is read:

```ts
const server = serve(app, {
  port: 2575,
  tls: {
    ca: fs.readFileSync("ca.pem"),
    cert: fs.readFileSync("cert.pem"),
    key: fs.readFileSync("key.pem"),
    requestCert: true,
  },
});
```

## Design notes

### Why no built-in logging?

The core has zero `console.log` or `console.error` calls. Logging is an opt-in middleware concern, giving you full control over format, destination, and verbosity without the core making assumptions about your observability stack.

## Part of Glion

`@glion/mllp` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
