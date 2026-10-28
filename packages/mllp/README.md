# @glion/mllp

Routes and middleware that respond to HL7v2 messages, on any runtime, with an MLLP server for Node.js and Bun.

## What it does

An `Mllp` app routes each HL7v2 message to a handler by message type and trigger event, and runs middleware around it. `app.handle(payload, env?)` replies to one message and depends on no runtime: a Cloudflare Worker or an AWS Lambda function calls it with each message it receives. `handleConnection()` runs the MLLP exchange over any socket that exposes Web Streams, and `serve()` from `@glion/mllp/node` listens on a TCP or TLS port and runs it on every connection.

## Install

```bash
npm install @glion/mllp
```

### Package exports

| Subpath            | Description                                           |
| ------------------ | ----------------------------------------------------- |
| `@glion/mllp`      | `Mllp`, `handleConnection()`; Web APIs only           |
| `@glion/mllp/node` | `serve()`, the TCP and TLS server for Node.js and Bun |

## Use

```ts
import { Mllp } from "@glion/mllp";
import { serve } from "@glion/mllp/node";
import { parseHL7v2 } from "@glion/hl7v2";

const app = new Mllp()
  .parser(parseHL7v2)
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

The app. `Mllp<E>` types `ctx.env` as `E`; it defaults to `unknown`. Built with a fluent chainable API:

| Method                      | Description                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.parser(processor)`        | Attach a `unified` processor (or `@glion/parser` alone) as the parse stage.                                                                                                                                                    |
| `.use(middleware)`          | Register global middleware that runs for every message.                                                                                                                                                                        |
| `.use(pattern, middleware)` | Register scoped middleware that runs only for matching message types.                                                                                                                                                          |
| `.on(pattern, handler)`     | Register a terminal route handler for a message type or trigger event.                                                                                                                                                         |
| `.onError(errorHandler)`    | Register a catch-all error handler.                                                                                                                                                                                            |
| `.handle(payload, env?)`    | Reply to one message, given as bytes without MLLP framing; resolves to the response's `raw` as UTF-8 bytes, or `undefined` for none. `env` becomes `ctx.env`, and is required when `E` excludes `undefined`. Bound to the app. |

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

### `serve(options)` — from `@glion/mllp/node`

Start a Node.js or Bun TCP server that runs `handleConnection()` on every connection it accepts. Each message reaches `handle` with a `NodeEnv`, `{ connection }`, where `connection` is a `ConnectionInfo`: `id`, `remoteAddress`, `remotePort`, `localPort`, `secure`, and a `state` map kept across the messages of the connection.

| Option           | Type                                                          | Description                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handle`         | `(payload, env: NodeEnv) => Promise<Uint8Array \| undefined>` | The response to each message; `app.handle`.                                                                                                                                                                                                                                                                                                                                                                           |
| `port`           | `number`                                                      | TCP port to listen on.                                                                                                                                                                                                                                                                                                                                                                                                |
| `hostname`       | `string`, optional                                            | Interface to bind. Defaults to all interfaces.                                                                                                                                                                                                                                                                                                                                                                        |
| `tls`            | `tls.TlsOptions`, optional                                    | Node's TLS server options, passed to `tls.createServer()` unchanged. Plain TCP without it. See [TLS](#tls).                                                                                                                                                                                                                                                                                                           |
| `maxConnections` | `number`, optional                                            | Most connections open at once; one past it is closed before any message is read. Unlimited when unset. See [Connections](#connections).                                                                                                                                                                                                                                                                               |
| `socketTimeout`  | `number`, optional                                            | Socket inactivity timeout in ms — an idle socket past it is destroyed. `0` (default) disables.                                                                                                                                                                                                                                                                                                                        |
| `onConnect`      | `ConnectionCallback`, optional                                | Called when a new TCP connection is accepted.                                                                                                                                                                                                                                                                                                                                                                         |
| `onDisconnect`   | `ConnectionCallback`, optional                                | Called when a connection closes — always fires, even if `onConnect` threw.                                                                                                                                                                                                                                                                                                                                            |
| `onError`        | `ErrorCallback`, optional                                     | Called when a lifecycle callback throws, `handle` rejects (with the message's `MessageInfo`; the message gets no reply and the connection stays open), the byte stream breaks (`PROTOCOL_VIOLATION`), or the socket fails other than by a reset, a broken pipe or a timeout; the connection closes after the last two. Without it, or when it throws, `console.error` logs the error's message and the connection ID. |

### Wire framing

MLLP framing lives in [`@glion/mllp-codec`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp-codec) — `frame()` wraps outbound messages, `unframe()` streams inbound bytes back into them. `@glion/mllp` consumes it internally and re-exports nothing from it; import it directly when you need the codec.

### Types

| Type                      | Description                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Context`                 | Request context with message data and routing fields.                                                                                                                                       |
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

| Code                   | Meaning                                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NO_PARSER`            | `app.handle()` ran before a parser was registered via `app.parser()`.                                                                               |
| `INCOMPATIBLE_CHARSET` | `app.handle()` was given a message it could not decode as UTF-8 (the `CharsetError` is on `cause`).                                                 |
| `INVALID_OPTION`       | `serve()` was given no `handle` function, or a `port` that is not an integer from 0 to 65535. The error's `option` names which: `handle` or `port`. |
| `PROTOCOL_VIOLATION`   | The MLLP byte stream was violated and the connection closed (the `MllpCodecError` is on `cause`). Raised by `handleConnection()`.                   |

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
  if (!isAuthorized(ctx.ast)) {
    return { raw: buildNakFor(ctx, "Unauthorized") };
  }
});
```

## Context

Available in every middleware and handler. The pipeline is lazy: only the parse step runs eagerly; transforms and compilation are deferred until accessed.

### Sync properties

| Property               | Description                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ctx.req.raw`          | Original HL7v2 message string.                                                                             |
| `ctx.req.bytes`        | Raw bytes from the MLLP frame.                                                                             |
| `ctx.env`              | What the runtime passed to `handle()`: a `NodeEnv` under `serve()`, a Workers environment, or `undefined`. |
| `ctx.messageType`      | MSH-9.1 (e.g. `"ADT"`).                                                                                    |
| `ctx.triggerEvent`     | MSH-9.2 (e.g. `"A01"`).                                                                                    |
| `ctx.messageStructure` | MSH-9.3 (e.g. `"ADT_A01"`).                                                                                |
| `ctx.version`          | MSH-12 (e.g. `"2.5.1"`).                                                                                   |
| `ctx.controlId`        | MSH-10 message control ID.                                                                                 |
| `ctx.ast`              | Raw parsed AST — pre-transform, straight from the wire.                                                    |
| `ctx.file`             | VFile (diagnostics accumulate after `tree()`).                                                             |
| `ctx.set(key, value)`  | Store a variable.                                                                                          |
| `ctx.get(key)`         | Retrieve a variable.                                                                                       |
| `ctx.var`              | Read-only snapshot of all variables.                                                                       |

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
  return { raw: "..." };
});
```

Use `await ctx.result()` when you need the compiled output:

```ts
app.on("ORU^R01", async (ctx) => {
  const json = await ctx.result(); // triggers transform + compile
  await saveToDatabase(json);
  return { raw: "..." };
});
```

### Writing middleware — prefer `ctx.ast`

Most middleware only needs routing fields or raw MSH data — both available synchronously from `ctx.ast`. Reach for `await ctx.tree()` only when you genuinely need the transformed tree.

```ts
// Good — sync, fast, no pipeline cost.
function authMiddleware(): Middleware {
  return (ctx, next) => {
    if (!isAuthorized(ctx.ast)) {
      return { raw: buildNak(ctx.ast, "Unauthorized") };
    }
    return next();
  };
}

// Good — ACK middleware reads MSH fields from the pre-transform tree.
function ackMiddleware(): Middleware {
  return async (ctx, next) => {
    await next();
    ctx.res = { raw: toHl7v2(acknowledge(ctx.ast)) };
  };
}

// Only when needed — triggers transform pipeline.
function validationMiddleware(): Middleware {
  return async (ctx, next) => {
    const tree = await ctx.tree();
    if (!isValid(tree)) {
      return { raw: buildNak(ctx.ast, "Invalid") };
    }
    return next();
  };
}
```

## Error handling

```ts
app.onError(async (err, ctx) => {
  console.error(`Error processing ${ctx.controlId}:`, err.message);
  return { raw: buildNakFor(ctx, err.message) };
});
```

Without an error handler, errors are absorbed and no response is sent. The sending system will time out and retry per standard MLLP behaviour. See the [design notes](#design-notes) below for the rationale.

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
import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";

const app = new Mllp<Env>().parser(parseHL7v2).on("ADT^A01", async (ctx) => {
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
const app = new Mllp().parser(parseHL7v2);

app.use(logger()); // observability — provided by middleware

app.on("ADT^A01", handler);
```

### Why no built-in logging?

The core has zero `console.log` or `console.error` calls. Logging is an opt-in middleware concern, giving you full control over format, destination, and verbosity without the core making assumptions about your observability stack.

## Part of Glion

`@glion/mllp` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
