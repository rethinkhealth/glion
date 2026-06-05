# 11. MLLP Transport Server

Date: 2026-03-05

## Status

Proposed

## Context

The `@rethinkhealth/hl7v2-mllp` package currently provides low-level MLLP primitives: frame encoding/decoding (single, multi-frame, and streaming), ACK/NAK generation, unified processor integration, and a Web Streams-based pipeline. These are the building blocks, but there is no server, client, or connection management layer.

We need a transport layer that:

- Runs on Node.js and Bun natively (runtime-agnostic)
- Follows modern API patterns (Hono-style middleware and routing)
- Integrates naturally with our unified processor pipeline
- Builds on our existing MLLP primitives rather than replacing them
- Supports server, client, and gateway use cases from shared components

### MLLP Protocol Overview

MLLP (Minimal Lower Layer Protocol) is a simple framing protocol for transmitting HL7v2 messages over TCP:

```
[0x0B] <HL7v2 message content> [0x1C][0x0D]
```

- `0x0B` (VT) — start byte, marks beginning of message
- `0x1C` (FS) — first end byte
- `0x0D` (CR) — second end byte, completes the frame

The protocol is stateless per-message: sender transmits a framed message, receiver processes it, receiver sends back a framed ACK/NAK. TCP connections may be persistent (many messages over one connection) or transient.

### What Already Exists

The following primitives are implemented in `packages/hl7v2-mllp/src/`:

| Module                | Purpose                                                                         |
| --------------------- | ------------------------------------------------------------------------------- |
| `constants.ts`        | MLLP framing bytes (VT, FS, CR)                                                 |
| `encoder.ts`          | `encode()`, `encodeMultiple()` — wrap messages in MLLP frames                   |
| `decoder.ts`          | `decode()`, `decodeMultiple()`, `isValidFrame()` — extract messages from frames |
| `encoder-stream.ts`   | `createEncoderStream()` — Web Streams TransformStream for encoding              |
| `decoder-stream.ts`   | `createDecoderStream()` — streaming state-machine decoder with buffering        |
| `processor-stream.ts` | `createProcessorStream()` — bridges MLLP to unified pipeline                    |
| `pipeline.ts`         | `createMLLPPipeline()` — chains decoder → processor → ACK → encoder             |
| `ack.ts`              | `generateAck()`, `generateNak()`, `parseMsh()` — ACK/NAK message generation     |
| `errors.ts`           | `MLLPError` with typed error codes                                              |
| `types.ts`            | `MLLPMessage`, `MLLPInput`, `MLLPErrorCode`, options types                      |

All streaming uses the **Web Streams API** (`TransformStream`, `ReadableStream`, `WritableStream`), which is supported by both Node.js 18+ and Bun.

## Decision

We will build a **Hono-architecture MLLP server** that follows Hono's patterns as closely as possible, adapted from HTTP to HL7v2 MLLP transport. The server is a thin orchestration layer on top of our existing primitives, with a runtime-agnostic TCP adapter interface.

### 1. Architecture Overview

```
                     @rethinkhealth/hl7v2-mllp
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌────────────────── EXISTING (Layer 0) ──────────────────┐ │
│  │  Constants ╎ Encoder ╎ Decoder ╎ Streams ╎ ACK ╎ Errors│ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌────────────────── NEW: Server Layer ───────────────────┐ │
│  │                                                        │ │
│  │  ┌─ MllpServer (Hono-style) ────────────────────────┐  │ │
│  │  │  .use(middleware)        ← Hono middleware API    │  │ │
│  │  │  .use(unifiedProcessor)  ← accepts Processor     │  │ │
│  │  │  .use('ADT^*', mw)      ← scoped middleware      │  │ │
│  │  │  .on('ADT^A01', handler) ← route by msg type     │  │ │
│  │  │  .on('*', handler)       ← catch-all             │  │ │
│  │  │  .onError(handler)       ← error boundary        │  │ │
│  │  │  .listen()               ← starts via adapter    │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  │                                                        │ │
│  │  ┌─ MllpContext ────────────────────────────────────┐  │ │
│  │  │  .req.raw / .req.bytes   ← incoming message      │  │ │
│  │  │  .tree / .file           ← after processing      │  │ │
│  │  │  .messageType / etc.     ← after annotation      │  │ │
│  │  │  .set() / .get() / .var  ← Hono variable API     │  │ │
│  │  │  .ack() / .nak()         ← response helpers      │  │ │
│  │  │  .connection             ← socket metadata       │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  │                                                        │ │
│  │  ┌─ MllpClient ────────────────────────────────────┐  │ │
│  │  │  .send(message) → ACK    ← send and wait        │  │ │
│  │  │  .close()                ← disconnect            │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  │                                                        │ │
│  │  ┌─ Adapters ──────────────────────────────────────┐  │ │
│  │  │  nodeAdapter()   ← Node.js net/tls module       │  │ │
│  │  │  bunAdapter()    ← Bun.listen / Bun.connect     │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2. MllpServer — Hono-Style API

The server follows Hono's class structure with four core methods: `.use()`, `.on()`, `.onError()`, `.listen()`.

#### Constructor and Adapter

```typescript
const server = new MllpServer({
  adapter: nodeAdapter({ port: 2575 }),
});
```

The adapter is an abstraction over the TCP runtime. It provides `listen()` and `close()` capabilities while the server handles everything above TCP (MLLP framing, middleware, routing).

#### `.use()` — Middleware and Unified Processor Registration

`.use()` is overloaded to accept two types of arguments:

**1. Standard middleware (Hono-style):**

```typescript
server.use(async (ctx, next) => {
  const start = performance.now();
  await next();
  console.log(`Processed in ${performance.now() - start}ms`);
});
```

**2. Unified processor (duck-typed via `.process()` method):**

```typescript
server.use(parseHL7v2);

// Or compose inline:
server.use(
  unified().use(hl7v2Parser).use(hl7v2AnnotateMessage).use(hl7v2DecodeEscapes)
);
```

When a unified processor is passed, the server internally wraps it as middleware that:

1. Runs `processor.process(ctx.req.raw)` to get a VFile
2. Sets `ctx.tree` to the parsed AST (`file.result`)
3. Sets `ctx.file` to the VFile (with diagnostics)
4. Extracts `ctx.messageType`, `ctx.triggerEvent`, `ctx.version`, `ctx.controlId` from the MSH segment annotation
5. Calls `next()`

Detection uses duck-typing: if the argument has a `.process()` method and a `.use()` method, it is treated as a unified processor. Otherwise it is treated as middleware.

**3. Scoped middleware (Hono path-scoped pattern):**

```typescript
// Only runs for ADT messages
server.use("ADT^*", async (ctx, next) => {
  console.log("ADT message received");
  await next();
});
```

The pattern string follows the format `{messageType}^{triggerEvent}` with `*` as wildcard.

#### `.on()` — Route Handlers

Routes messages to handlers by message type pattern:

```typescript
server.on("ADT^A01", async (ctx) => {
  await admitPatient(ctx.tree);
  return ctx.ack();
});

server.on("ORU^R01", async (ctx) => {
  await processLabResult(ctx.tree);
  return ctx.ack();
});

// Catch-all (like Hono's app.all('*'))
server.on("*", async (ctx) => {
  return ctx.nak("AR", `Unsupported: ${ctx.messageType}^${ctx.triggerEvent}`);
});
```

**Routing rules:**

- Patterns are matched in registration order
- `*` matches any message type or trigger event
- `ADT^*` matches any ADT message
- `*^A01` matches any message type with trigger event A01
- `ADT^A01` matches exactly

#### `.onError()` — Error Boundary

```typescript
server.onError(async (err, ctx) => {
  logger.error({ err, messageType: ctx.messageType }, "Processing failed");
  return ctx.nak("AE", "Internal server error");
});
```

If no error handler is registered, the default behavior is to send a NAK with code `AE` and the error message.

#### `.listen()` and `.close()` — Lifecycle

```typescript
const handle = server.listen();
// handle.port — bound port
// handle.close() — graceful shutdown
```

### 3. MllpContext — Hono's Context Adapted

The context object follows Hono's `c` (Context) API:

```typescript
interface MllpContext {
  // ── Request (like c.req) ──────────────────────────
  req: {
    raw: string; // original HL7 message string
    bytes: Uint8Array; // raw bytes from MLLP frame
  };

  // ── Connection metadata ───────────────────────────
  connection: {
    remoteAddress: string;
    remotePort: number;
    localPort: number;
    secure: boolean; // true if TLS
  };

  // ── Populated by unified processor middleware ─────
  tree: Root | undefined;
  file: VFile | undefined;

  // ── Populated from MSH segment ────────────────────
  messageType: string; // MSH-9.1 (e.g., "ADT")
  triggerEvent: string; // MSH-9.2 (e.g., "A01")
  messageStructure: string; // MSH-9.3 (e.g., "ADT_A01")
  version: string; // MSH-12 (e.g., "2.5.1")
  controlId: string; // MSH-10

  // ── Variables (like c.set / c.get / c.var) ────────
  set<K extends string>(key: K, value: unknown): void;
  get<K extends string>(key: K): unknown;
  readonly var: Readonly<Record<string, unknown>>;

  // ── Response helpers (like c.json / c.text) ───────
  ack(options?: AckOptions): MllpResponse;
  nak(code: AckCode, reason: string): MllpResponse;
}
```

**How context gets populated:**

1. **Always available** (set by the server after MLLP decode): `req.raw`, `req.bytes`, `connection`
2. **Always extracted** (MSH-9 lightweight extraction for routing): `messageType`, `triggerEvent`, `controlId`
3. **Available after `.use(processor)`**: `tree`, `file`, and enriched `messageType`/`triggerEvent`/`version`/`messageStructure` from the unified annotation plugins

The server always does a lightweight MSH extraction (reusing `parseMsh()` from `ack.ts`) for routing purposes, even without a unified processor. When a processor IS used, the richer annotation data overwrites the lightweight extraction.

### 4. Middleware Execution Model

Follows the **onion model** (Hono/Koa):

```
Message arrives (MLLP frame → decoded)
  → middleware 1 (before)
    → middleware 2 (before)
      → unified processor (parse, annotate, lint)
        → scoped middleware (ADT^* only)
          → router → handler (ADT^A01)
          ← return ctx.ack()
        ← scoped middleware (after)
      ← unified processor done
    ← middleware 2 (after)
  ← middleware 1 (after)
Response sent (ACK → MLLP encode → TCP)
```

The `compose()` function chains middleware exactly like Hono's implementation:

```typescript
type MllpMiddleware = (
  ctx: MllpContext,
  next: () => Promise<void>
) => Promise<void | MllpResponse>;
type MllpHandler = (ctx: MllpContext) => Promise<MllpResponse>;
```

### 5. Adapter Interface

The adapter abstracts the TCP runtime. The server only interacts through this interface:

```typescript
interface TcpAdapter {
  listen(options: ListenOptions, handler: ConnectionHandler): TcpHandle;
}

interface ListenOptions {
  port: number;
  hostname?: string;
  tls?: TlsOptions;
  backlog?: number;
}

interface TcpHandle {
  port: number;
  close(): Promise<void>;
}

type ConnectionHandler = (socket: AdapterSocket) => void;

interface AdapterSocket {
  readonly remoteAddress: string;
  readonly remotePort: number;
  readonly localPort: number;
  readonly secure: boolean;
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  close(): void;
}
```

**Key design choice:** The adapter exposes sockets as **Web Streams** (`ReadableStream`/`WritableStream`). Both Node.js and Bun can wrap their native sockets into Web Streams. This lets our existing pipeline (`createMLLPPipeline`) connect directly.

#### Node.js Adapter

```typescript
import { createServer } from "node:net";

export function nodeAdapter(options: NodeAdapterOptions): TcpAdapter {
  return {
    listen(listenOpts, handler) {
      const server = createServer((socket) => {
        handler(wrapNodeSocket(socket));
      });
      server.listen(listenOpts.port, listenOpts.hostname);
      return { port: listenOpts.port, close: () => server.close() };
    },
  };
}
```

#### Bun Adapter

```typescript
export function bunAdapter(options: BunAdapterOptions): TcpAdapter {
  return {
    listen(listenOpts, handler) {
      const server = Bun.listen({
        port: listenOpts.port,
        hostname: listenOpts.hostname,
        socket: {
          open(socket) {
            handler(wrapBunSocket(socket));
          },
          data(socket, data) {
            /* push to ReadableStream */
          },
          close(socket) {
            /* close ReadableStream */
          },
        },
      });
      return { port: server.port, close: () => server.stop() };
    },
  };
}
```

### 6. MllpClient

The client reuses the same encoder/decoder and adapter abstraction:

```typescript
const client = new MllpClient({
  adapter: nodeAdapter({ host: "lis.hospital.org", port: 2575 }),
  timeout: 30_000,
});

const response = await client.send(hl7Message);
// response.code  — "AA" | "AE" | "AR"
// response.raw   — raw ACK string
// response.ack   — true if accepted (AA or CA)

await client.close();
```

The client:

1. Connects to the remote host via the adapter
2. Encodes the message with MLLP framing (`encode()`)
3. Sends over TCP
4. Reads the response through the decoder stream
5. Parses the ACK to extract the acknowledgment code
6. Returns the structured response

### 7. Gateway (Server + HTTP Forwarding)

The gateway is not a separate component — it's a server with a built-in handler that forwards messages over HTTP:

```typescript
const gateway = new MllpServer({
  adapter: nodeAdapter({ port: 2575 }),
});

gateway.use(parseHL7v2);

gateway.on("*", async (ctx) => {
  const response = await fetch("https://api.example.com/hl7", {
    method: "POST",
    body: ctx.req.raw,
    headers: { "Content-Type": "application/hl7-v2" },
  });

  if (response.ok) return ctx.ack();
  return ctx.nak("AE", `HTTP ${response.status}`);
});

gateway.listen();
```

No special gateway code is needed. The server's middleware/handler model already supports this pattern.

### 8. Internal Wiring

When a message arrives, the server internally:

1. **MLLP decode**: Uses `decode()` from our existing decoder to extract the raw message from the MLLP frame
2. **Create context**: Constructs `MllpContext` with `req.raw`, `req.bytes`, and `connection` metadata
3. **Extract MSH**: Calls `parseMsh()` (existing) to populate `messageType`, `triggerEvent`, `controlId` for routing
4. **Run middleware chain**: Executes composed middleware (including any unified processor) via `compose()`
5. **Route**: Matches `messageType^triggerEvent` against registered `.on()` patterns, dispatches to handler
6. **Encode response**: Takes the `MllpResponse` from the handler, encodes it with `encode()` from our existing encoder
7. **Send**: Writes the MLLP-framed ACK back to the socket

Steps 1, 6, and 7 use existing primitives. Steps 2-5 are the new server layer.

For streaming scenarios (persistent connections with many messages), the server uses `createDecoderStream()` to continuously extract messages from the TCP stream, processing each through the middleware chain independently.

### 9. Complete Usage Examples

#### Minimal (3 lines)

```typescript
const server = new MllpServer({ adapter: nodeAdapter({ port: 2575 }) });
server.use(parseHL7v2);
server.on("*", async (ctx) => ctx.ack());
server.listen();
```

#### Production

```typescript
const server = new MllpServer({
  adapter: nodeAdapter({
    port: 2575,
    tls: { cert: readFileSync("cert.pem"), key: readFileSync("key.pem") },
  }),
});

// Pipeline
server.use(parseHL7v2);

// Logging
server.use(async (ctx, next) => {
  console.log(
    `<- ${ctx.messageType}^${ctx.triggerEvent} from ${ctx.connection.remoteAddress}`
  );
  await next();
  console.log(`-> response sent`);
});

// Validation for ADT messages
server.use("ADT^*", async (ctx, next) => {
  if (ctx.file?.messages.some((m) => m.fatal)) {
    return ctx.nak("AR", "Message failed validation");
  }
  await next();
});

// Handlers
server.on("ADT^A01", async (ctx) => {
  await admitPatient(ctx.tree);
  return ctx.ack();
});

server.on("ORU^R01", async (ctx) => {
  await processLabResult(ctx.tree);
  return ctx.ack();
});

server.on("*", async (ctx) => {
  return ctx.nak("AR", `Unsupported: ${ctx.messageType}^${ctx.triggerEvent}`);
});

server.onError(async (err, ctx) => {
  console.error(err);
  return ctx.nak("AE", "Internal error");
});

server.listen();
```

#### Client

```typescript
const client = new MllpClient({
  adapter: nodeAdapter({ host: "lis.hospital.org", port: 2575 }),
});

const ack = await client.send(adtMessage);
if (!ack.accepted) {
  console.error(`Rejected: ${ack.code} — ${ack.text}`);
}

await client.close();
```

## Consequences

### Positive

- **Familiar API**: Developers who know Hono/Express/Koa can use the MLLP server immediately. `server.use()` and `server.on()` are universally understood patterns.
- **Unified integration without wrappers**: Passing `parseHL7v2` directly to `.use()` avoids custom MLLP-specific middleware wrappers. Users compose their pipeline with the same unified API they already use.
- **Builds on existing work**: The server layer is thin — all MLLP framing, ACK generation, and streaming primitives already exist. We only add orchestration.
- **Runtime-agnostic**: The adapter interface lets us support Node.js and Bun without conditional logic in the server.
- **Gateway is free**: No special gateway code needed. A server with a `fetch()` call in the handler IS a gateway.
- **Testable**: Middleware and handlers are pure async functions. The adapter can be mocked for testing without real TCP.

### Negative

- **Two levels of routing**: The unified processor extracts rich message metadata, but the server also does lightweight MSH extraction for routing. This is intentional (routing must work without a processor) but creates a subtle two-tier system.
- **Web Streams dependency**: The adapter interface uses Web Streams, which requires wrapping native sockets. This adds a thin abstraction layer.
- **Bun adapter complexity**: Bun's shared-handler TCP model is fundamentally different from Node.js's per-connection EventEmitter. The adapter must bridge this gap.

### Risks

- **Backpressure handling**: Web Streams have built-in backpressure, but the interaction between middleware processing time and TCP flow control needs careful testing under load.
- **Connection lifecycle**: Persistent MLLP connections require careful cleanup on errors, timeouts, and graceful shutdown.

## References

- [Hono framework](https://hono.dev) — middleware, context, and routing patterns
- [Bun TCP API](https://bun.sh/docs/api/tcp) — `Bun.listen`, shared handler model
- [Node.js net module](https://nodejs.org/api/net.html) — `net.createServer`
- [Web Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API) — `TransformStream`, `ReadableStream`

## Update — UTF-8 decode and parse moved into the core; failures routed to the error handler

The implemented design refines the context/error flow described above:

- **`Mllp.handle(payload, connection)` takes bytes, not text.** `createContext` decodes (`@glion/util-charset` `decodeBytes`) and parses inside the core — not in the Node `serve.ts` adapter — so every runtime adapter behaves identically and only forwards the de-framed payload.
- **`ctx.req` no longer carries `bytes`.** It exposes only `req.raw` (the decoded text, `""` when the payload is not UTF-8); nothing read `req.bytes`, so it was dropped. `ctx.error` records the decode/parse failure.
- **Decode/parse failures never throw out of band.** `createContext` is the single total step — a non-UTF-8 payload or a parser throw yields an empty `Root` recorded on `ctx.error`. `handle()` surfaces that failure as the **innermost step of the middleware chain** (where the route handler would run), so a wrapping middleware — `@glion/mllp-ack`'s `ackMiddleware` — catches it and builds a NAK, exactly like a thrown handler error. If nothing in the chain handles it, it propagates to `handle()`'s single try/catch → `#handleError`. This mirrors Hono's `dispatch` (`try { compose } catch (err) → #handleError`). Surfacing `ctx.error` _into_ the chain (not throwing it before `compose`) is what lets the ack middleware NAK decode/parse failures — the same path it already uses for handler throws.
- **A default NAK floor guarantees a reply.** When neither an ack middleware nor `app.onError` produces a response, `#handleError` returns a minimal `MSA|AE` NAK (the HTTP-500 equivalent) instead of re-throwing — so an errored message is never met with silence. The floor is deliberately minimal (a bare `MSA|AE` echoing the control id); rich, fully-echoed ACK/NAK construction stays in `@glion/mllp-ack`. This revises the original "no default error response" decision (silence-by-default was the wrong default; every onion framework returns one).
- **`serve()`'s `onError` is transport/lifecycle only.** Because semantic errors (handler/decode/parse) become a NAK inside the core, they no longer escape to the Node adapter; `serve({ onError })` fires only for errors that _do_ escape — a throwing `onConnect`/`onDisconnect`/`app.onError`, or `NO_PARSER`. Observe semantic errors with a logger middleware (the application layer owns its own errors; the transport owns transport errors).
- **Every transport error layer is observable (no silent drops).** Following the same model as Node's `server`/`socket`/`clientError` events, each layer has its own channel: a startup/bind error rejects `server.listening`; a post-listen server error → `onServerError` (server keeps serving); a malformed/oversized MLLP envelope → `onFramingError` (connection torn down, **no NAK** per the MLLP spec — there's no message boundary, but `FRAME_TOO_LARGE` is a DoS signal worth seeing); routine connection drops (ECONNRESET/timeout) stay silent. Framing-error reporting is PHI-safe — only the typed `code`, never the offending bytes. This closes the Mirth-style silent-drop footgun (NextGen Connect #3170).
- **Peer-controlled waits are bounded.** A single write's drain wait is capped by `writeTimeout` (default 30 s; on expiry the socket is destroyed), so a stalled peer can't hang a connection's message loop indefinitely — the same DoS-defence rationale as the 16 MiB `FRAME_TOO_LARGE` cap, extended to the write path. `AdapterSocket.close()` carries a documented MUST-NOT-throw + idempotent contract (honoured at the adapter, trusted unguarded by the core) per Design Philosophy §3/§9.
