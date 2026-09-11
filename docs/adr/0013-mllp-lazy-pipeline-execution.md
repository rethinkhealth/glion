# 13. MLLP Lazy Pipeline Execution

Date: 2026-03-27

## Status

Accepted

## Context

The MLLP server currently runs the full unified pipeline — parse, transform (annotations, escape decoding, lint), and compile (JSON) — **before** routing. This means every incoming message pays the full pipeline cost, even if:

- No handler matches the message (it will be discarded)
- A middleware short-circuits before the handler runs
- The handler only needs the raw tree, not the compiled result

Benchmarks show the full pipeline at ~2,400 ops/sec for small messages. The parse step alone (tokenization into AST) is synchronous and fast. The transform step (running all plugins) and compile step (e.g., JSON serialization) are the expensive parts.

### The Routing Problem

Routing depends on MSH fields: `messageType` (MSH-9.1), `triggerEvent` (MSH-9.2), `controlId` (MSH-10), `version` (MSH-12). These are extracted from the parsed AST via `queryValue()`.

The question: should routing use the **pre-transform** or **post-transform** tree?

#### Analysis of Current Transformers

| Transformer             | Reads routing fields             | Writes routing fields                     |
| ----------------------- | -------------------------------- | ----------------------------------------- |
| `hl7v2MessageStructure` | MSH-9.1, MSH-9.2, MSH-12 (reads) | MSH-9.3 only (fills in when missing)      |
| `hl7v2DecodeEscapes`    | None                             | None (decodes escape sequences in values) |
| Lint plugins            | Various (read-only)              | None (write to VFile messages)            |
| `hl7v2Jsonify`          | None                             | None (compiler, produces `file.result`)   |

**No current transformer modifies MSH-9.1, MSH-9.2, MSH-10, or MSH-12.** The only write is MSH-9.3 (message structure), which is additive — resolving a missing value from MSH-9.1 + MSH-9.2.

A custom user transformer _could_ modify routing fields, but this should not affect routing — the message should be routed based on what the sending system actually sent.

## Decision

### 1. Route on cached string fields, not the tree object

Routing fields (messageType, triggerEvent, controlId, version, messageStructure) are extracted as strings from the parsed tree immediately during context creation. These cached strings always reflect the original wire values, even after transformers enrich the tree in-place.

**Rationale**: Routing should be deterministic based on the incoming message. By caching the routing fields as immutable strings, routing is independent of whether or when transformers run.

The parsed tree is exposed as `ctx.ast` for synchronous access (e.g., ACK building). It is the same object reference as the tree returned by `ctx.tree()` — after `tree()` resolves, transformers may have enriched it in-place. We intentionally do not clone to avoid memory overhead on large messages.

### 2. `ctx.tree` is async and returns the transformed tree

`ctx.tree` becomes an async getter (or method) that triggers `run()` on first access. The transform step — annotations, escape decoding, linting — runs lazily, only when a handler or middleware actually needs the transformed tree.

**Rationale**: Not all messages need the full transform pipeline. Middleware that short-circuits (e.g., rate limiting, auth checks using `ctx.connection`) never needs the tree. Unmatched messages never need it at all.

### 3. `ctx.result` is async and returns the compiled output

`ctx.result` triggers `stringify()` on first access, after the tree has been transformed. The compile step (e.g., JSON via `hl7v2Jsonify`) only runs when explicitly accessed.

**Rationale**: Many handlers work with the tree directly and never need the compiled JSON. Compilation should be pay-for-what-you-use.

### 4. `ctx.file` accumulates diagnostics progressively

The VFile is created during context creation and collects diagnostics as each pipeline stage runs. After `ctx.tree` is accessed (triggering `run()`), `ctx.file.messages` contains lint messages. After `ctx.result` is accessed (triggering `stringify()`), the file is fully populated.

### 5. Pipeline execution lifecycle

```
handle(raw, bytes, connection)
  1. parse(raw)              → _parsed tree (sync, fast)
  2. Extract routing fields  → messageType, triggerEvent, etc. from _parsed
  3. Route match             → find handler + collect middleware
  4. If no match → return undefined (zero transform/compile cost)
  5. Build context with lazy getters
  6. Execute middleware + handler
     - ctx.tree accessed?    → run(_parsed, file) triggers transforms
     - ctx.result accessed?  → stringify(tree, file) triggers compilation
  7. Return ctx.res
```

### 6. Cost model

| Scenario                         | Parse | Transform                   | Compile                       |
| -------------------------------- | ----- | --------------------------- | ----------------------------- |
| No matching route                | Yes   | No                          | No                            |
| Middleware short-circuits        | Yes   | Only if `ctx.tree` accessed | Only if `ctx.result` accessed |
| Handler uses `ctx.tree`          | Yes   | Yes                         | No                            |
| Handler uses `ctx.result`        | Yes   | Yes                         | Yes                           |
| Handler uses only routing fields | Yes   | No                          | No                            |

## Consequences

### Positive

- Unmatched messages pay only the parse cost (fast, sync)
- Middleware that doesn't need the tree (auth, rate limiting, logging) runs without triggering transforms
- Compilation is fully opt-in — only handlers that need JSON pay for it
- Routing is deterministic and independent of transformer configuration

### Negative

- `ctx.tree` and `ctx.result` become async — handlers must `await ctx.tree` instead of accessing it directly
- This is a breaking change to the `Context` interface
- Slightly more complex internal implementation (lazy evaluation with caching)
- Filter functions that inspect `ctx.tree` need to work with the pre-transform tree or become async

### Migration

- `ctx.tree` → `await ctx.tree` in all handlers and middleware
- `ctx.result` → `await ctx.result` in all handlers that use compiled output
- Filter functions using `ctx.tree.children.length` etc. need review — they may work with the parsed (pre-transform) tree exposed via a sync accessor, or need to become async filters
