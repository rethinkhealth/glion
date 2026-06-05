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

- `port` (`number`) — TCP port to listen on.
- `hostname` (`string`, optional) — interface to bind. Defaults to all interfaces.
- `tls` (`{ cert, key }`, optional) — enable MLLP over TLS.

### Primitives

| Function                        | Description                                            |
| ------------------------------- | ------------------------------------------------------ |
| `encode(message)`               | Encode a message string into an MLLP frame.            |
| `decode(frame)`                 | Decode a single MLLP frame to its message.             |
| `createDecoderStream(options?)` | TransformStream for streaming decode from chunked TCP. |

### Types

| Type               | Description                                                         |
| ------------------ | ------------------------------------------------------------------- |
| `Context`          | Request context with message data and routing fields.               |
| `Response`         | Response object `{ raw: string }`.                                  |
| `Hl7v2Processor`   | Unified `Processor` type for HL7v2 (`Processor<Root, Root, Root>`). |
| `Middleware`       | Middleware function `(ctx, next) => ...`.                           |
| `Handler`          | Terminal route handler `(ctx) => Response`.                         |
| `ErrorHandler`     | Error handler `(err, ctx) => Response`.                             |
| `RouteFilter`      | Filter function `(ctx) => boolean` used for routing.                |
| `MiddlewareReturn` | Return type of middleware functions.                                |
| `ConnectionInfo`   | Connection metadata (remote/local address, TLS flag).               |
| `RoutePattern`     | Parsed route pattern.                                               |

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

| Property               | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| `ctx.req.raw`          | Decoded HL7v2 message text (`""` if the payload was not UTF-8). |
| `ctx.error`            | The decode/parse failure, if any (otherwise `undefined`).       |
| `ctx.connection`       | `{ remoteAddress, remotePort, localPort, secure }`.             |
| `ctx.messageType`      | MSH-9.1 (e.g. `"ADT"`).                                         |
| `ctx.triggerEvent`     | MSH-9.2 (e.g. `"A01"`).                                         |
| `ctx.messageStructure` | MSH-9.3 (e.g. `"ADT_A01"`).                                     |
| `ctx.version`          | MSH-12 (e.g. `"2.5.1"`).                                        |
| `ctx.controlId`        | MSH-10 message control ID.                                      |
| `ctx.ast`              | Raw parsed AST — pre-transform, straight from the wire.         |
| `ctx.file`             | VFile (diagnostics accumulate after `tree()`).                  |
| `ctx.set(key, value)`  | Store a variable.                                               |
| `ctx.get(key)`         | Retrieve a variable.                                            |
| `ctx.var`              | Read-only snapshot of all variables.                            |

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

Decode (non-UTF-8) and parse failures don't throw out of band. The core records them on `ctx.error` and surfaces them as the **innermost step of the middleware chain** — the same place a route handler runs — so a wrapping middleware (e.g. `@glion/mllp-ack`) can NAK them, exactly like a thrown handler error. If the chain doesn't handle it, it reaches `app.onError` (which can build a NAK), like Hono's `app.onError` or Koa's top-level error middleware.

**Every errored message gets a reply.** Without an `onError` handler and without an ack middleware, the core returns a **minimal default NAK** (`MSA|AE`) — the HTTP-500 equivalent — so the sender is never left hanging. This is a deliberately minimal floor; register `@glion/mllp-ack` (rich, fully-echoed NAKs) or `app.onError` (custom responses) to replace it. See the [design notes](#design-notes) below.

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

## Transport errors & timeouts

`serve()` has a single transport error channel, `onError`, that receives a discriminated **event** — `event.kind` tells you which layer failed (and narrows the payload). Branch on it to react per layer, or just log `event.error`. Nothing is silently dropped:

```ts
const server = serve(app, {
  port: 2575,
  onError: (event) => {
    switch (event.kind) {
      case "server": // post-listen server error; the server keeps serving
        return log.error({ err: event.error }, "mllp server error");
      case "framing": // malformed/oversized envelope — FRAME_TOO_LARGE is a DoS
        // signal. PHI-safe: typed code only, never the bytes. Torn down, no NAK.
        return log.warn({ code: event.error.code, conn: event.connection.id });
      default: // "connection": a throwing onConnect/onDisconnect/app.onError, or
        // NO_PARSER. Semantic handler/decode errors become a NAK, not this.
        return log.error({ err: event.error, info: event.messageInfo });
    }
  },
});
```

| Layer                        | `onError` kind                 | Behaviour                                        |
| ---------------------------- | ------------------------------ | ------------------------------------------------ |
| Startup / bind               | _(rejects `server.listening`)_ | port in use, bad TLS config                      |
| Server-scoped (post-listen)  | `"server"`                     | observed; server keeps serving                   |
| Protocol / framing           | `"framing"`                    | connection torn down, **no NAK** (spec-mandated) |
| Connection / socket          | _(silent)_                     | ECONNRESET / timeout — routine teardown          |
| Escaped core                 | `"connection"`                 | throwing callback / `NO_PARSER`                  |
| Application (handler/decode) | _(NAK)_                        | default `MSA\|AE` floor or ack middleware        |

A single timeout, `socketTimeout` (default `0` = off), bounds every peer-controlled wait: idle inactivity **and** a write whose buffer never drains (a stalled receiver). On expiry the socket is destroyed.

## Primitives

### Simple API

```ts
import { encode, decode } from "@glion/mllp";

const mllpFrame = encode(hl7Message);
const decoded = decode(mllpFrame);
console.log(decoded.text);
```

### Streaming API

```ts
import { createDecoderStream } from "@glion/mllp";

const decoder = createDecoderStream({
  maxMessageSize: 1024 * 1024,
  onError: (error) => console.warn(`[${error.code}] ${error.message}`),
});

tcpSocket.readable.pipeThrough(decoder).pipeTo(
  new WritableStream({
    write(message) {
      console.log("Received:", message.text);
    },
  })
);
```

## Design notes

### The default error response (and why it's minimal)

A rich HL7v2 ACK/NAK is version-dependent, varies by message type, and needs the inbound MSH segment to construct correctly. Building _that_ into the core would couple the routing engine to HL7v2 message construction — the wrong layer. But going _silent_ on an errored message is a worse footgun: every onion framework (Hono, Koa, Express) returns a default response rather than nothing.

So the `Mllp` engine splits the two: it guarantees a **minimal** floor and leaves the **rich** response to middleware.

- **Default floor** — when nothing else replies, the core returns a minimal `MSA|AE` NAK (the HTTP-500 equivalent), echoing the control id when the message was readable. Never silence.
- **Rich ACK/NAK** — add an acknowledgment middleware for proper, fully-echoed responses with `ERR` segments and correct codes. `@glion/mllp-ack` provides this out of the box and replaces the floor.
- **Custom error responses** — use `app.onError()` for application-specific handling; it replaces the floor too.
- **Observability** — semantic errors (handler throws, decode/parse) are the application's concern, not the transport's: add a logger middleware to observe them. `serve()`'s `onError` callback is for transport/lifecycle errors only (see below).

```ts
const app = new Mllp().parser(parseHL7v2);

app.use(logger()); // observability — provided by middleware
app.use(ackMiddleware()); // error → NAK translation — @glion/mllp-ack

app.on("ADT^A01", handler);
```

### Why no built-in logging?

The core has zero `console.log` or `console.error` calls. Logging is an opt-in middleware concern, giving you full control over format, destination, and verbosity without the core making assumptions about your observability stack.

## Part of Glion

`@glion/mllp` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
