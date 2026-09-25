# @glion/mllp

Transport-agnostic MLLP engine and middleware-driven MLLP server for HL7v2 messaging.

## What it does

`@glion/mllp` provides everything you need to send and receive HL7v2 messages over MLLP/TCP: an `Mllp` class with pattern-based routing, composable middleware, and first-class `unified` processor integration. The server is transport-agnostic at its core and ships with a `serve()` helper for Node.js and Bun. MLLP framing itself lives in [`@glion/mllp-codec`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp-codec).

## Install

```bash
npm install @glion/mllp
```

### Package exports

| Subpath            | Description                       |
| ------------------ | --------------------------------- |
| `@glion/mllp`      | Core `Mllp` class and routing     |
| `@glion/mllp/node` | `serve()` helper for Node and Bun |

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
| `.onError(errorHandler)`    | Register a catch-all error handler.                                         |

### `serve(app, options)` — from `@glion/mllp/node`

Start a Node.js or Bun TCP server that dispatches incoming MLLP frames through the `Mllp` instance.

| Option                  | Type                                        | Description                                                                                    |
| ----------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `port`                  | `number`                                    | TCP port to listen on.                                                                         |
| `hostname`              | `string`, optional                          | Interface to bind. Defaults to all interfaces.                                                 |
| `tls`                   | `{ cert, key, ca?, passphrase? }`, optional | Enable MLLP over TLS.                                                                          |
| `keepAlive`             | `boolean`, optional                         | Enable TCP keep-alive on accepted sockets. Defaults to `true`.                                 |
| `keepAliveInitialDelay` | `number`, optional                          | Delay in ms before the first keep-alive probe on an idle socket. Defaults to `60000`.          |
| `socketTimeout`         | `number`, optional                          | Socket inactivity timeout in ms — an idle socket past it is destroyed. `0` (default) disables. |
| `onConnect`             | `ConnectionCallback`, optional              | Called when a new TCP connection is accepted.                                                  |
| `onDisconnect`          | `ConnectionCallback`, optional              | Called when a connection closes — always fires, even if `onConnect` threw.                     |
| `onError`               | `ErrorCallback`, optional                   | Called when a handler error goes unhandled or a lifecycle callback throws.                     |

### Wire framing

MLLP framing lives in [`@glion/mllp-codec`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp-codec) — `frame()` wraps outbound messages, `unframe()` streams inbound bytes back into them. `@glion/mllp` consumes it internally and re-exports nothing from it; import it directly when you need the codec.

### Types

| Type               | Description                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Context`          | Request context with message data and routing fields.                                                                                                                                       |
| `Response`         | Response object `{ raw: string }`.                                                                                                                                                          |
| `Hl7v2Processor`   | Unified `Processor` type for HL7v2 (`Processor<Root, Root \| undefined, Root \| undefined>` — head/tail admit `undefined` so the bare `unified().use(hl7v2Parser).freeze()` is assignable). |
| `Middleware`       | Middleware function `(ctx, next) => ...`.                                                                                                                                                   |
| `Handler`          | Terminal route handler `(ctx) => Response`.                                                                                                                                                 |
| `ErrorHandler`     | Error handler `(err, ctx) => Response`.                                                                                                                                                     |
| `RouteFilter`      | Filter function `(ctx) => boolean` used for routing.                                                                                                                                        |
| `MiddlewareReturn` | Return type of middleware functions.                                                                                                                                                        |
| `ConnectionInfo`   | Connection metadata (remote/local address, TLS flag).                                                                                                                                       |
| `RoutePattern`     | Parsed route pattern.                                                                                                                                                                       |

### Errors

Server-side failures are raised (or passed to `onError`) as `MllpServerError` — branch on its stable `code`; the underlying codec or charset error rides on `cause`:

| Code                   | Meaning                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
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
  if (!isAuthorized(ctx.connection.remoteAddress)) {
    return { raw: buildNakFor(ctx, "Unauthorized") };
  }
});
```

## Context

Available in every middleware and handler. The pipeline is lazy: only the parse step runs eagerly; transforms and compilation are deferred until accessed.

### Sync properties

| Property               | Description                                             |
| ---------------------- | ------------------------------------------------------- |
| `ctx.req.raw`          | Original HL7v2 message string.                          |
| `ctx.req.bytes`        | Raw bytes from the MLLP frame.                          |
| `ctx.connection`       | `{ remoteAddress, remotePort, localPort, secure }`.     |
| `ctx.messageType`      | MSH-9.1 (e.g. `"ADT"`).                                 |
| `ctx.triggerEvent`     | MSH-9.2 (e.g. `"A01"`).                                 |
| `ctx.messageStructure` | MSH-9.3 (e.g. `"ADT_A01"`).                             |
| `ctx.version`          | MSH-12 (e.g. `"2.5.1"`).                                |
| `ctx.controlId`        | MSH-10 message control ID.                              |
| `ctx.ast`              | Raw parsed AST — pre-transform, straight from the wire. |
| `ctx.file`             | VFile (diagnostics accumulate after `tree()`).          |
| `ctx.set(key, value)`  | Store a variable.                                       |
| `ctx.get(key)`         | Retrieve a variable.                                    |
| `ctx.var`              | Read-only snapshot of all variables.                    |

### Async methods

| Method               | Triggers                | Description                                           |
| -------------------- | ----------------------- | ----------------------------------------------------- |
| `await ctx.tree()`   | `run()` (transform)     | Transformed AST — escape decoding, annotations, lint. |
| `await ctx.result()` | `run()` + `stringify()` | Compiled output (e.g. JSON from `hl7v2Jsonify`).      |

Both are cached — subsequent calls return the same value instantly.

### `ctx.ast` vs `await ctx.tree()`

Use `ctx.ast` when you only need the raw message structure — reading MSH fields, building ACK/NAK responses, route filter functions, or middleware that doesn't need escape-decoded values:

```ts
// Fast — no pipeline cost.
app.use((ctx, next) => {
  console.log(`Received ${ctx.messageType}^${ctx.triggerEvent}`);
  return next();
});
```

Use `await ctx.tree()` when you need the fully processed tree — business logic that reads decoded field values, or handlers that inspect annotations or resolved message structures:

```ts
// Triggers transform pipeline on first call.
app.on("ADT^A01", async (ctx) => {
  const tree = await ctx.tree();
  // tree has escape sequences decoded, message structure resolved, etc.
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
    if (!isAuthorized(ctx.connection.remoteAddress)) {
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

## TLS

TLS is supported via `serve()` options:

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
