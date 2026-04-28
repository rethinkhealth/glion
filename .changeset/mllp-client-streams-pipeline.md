---
"@glion/mllp-client": patch
---

Refactor `MllpClient.send()` onto a streams-native `socket → decoder → ack-parser` pipeline. Internal-only — no public API change.

**What changed**

- New internal `createAckParserStream()` — a `TransformStream<DecodedMessage, Acknowledgment>` that calls `parseAck` and either enqueues the parsed ACK or `controller.error()`s with the typed `MllpClientError(MALFORMED_ACK)`.
- The decoder now runs in **fatal** mode: its `onError` callback throws a typed `MllpClientError(MALFORMED_FRAME)`, which propagates out of `transform()` and errors the readable. (See the matching `@glion/mllp-transport` changeset that documents this contract.)
- `MllpClient.send()` consumes parsed acknowledgments directly from `reader.read()` — no inline `parseAck()`, no `localAbort` controller, no decoder `onError` → abort indirection.
- `core/internal/exchange.ts` is deleted. The orchestration is inlined into `client.ts` as a private `readAck(duplex, frame, params)` function plus small focused helpers (`encodeOrThrow`, `normaliseSendError`, `releaseLockSafely`).
- `WaitFor` moves from `internal/exchange.ts` to `client.ts` so it lives next to `SendOptions`.

**Why**

`exchange()` had grown into a god-function juggling two abort sources, a manual `reader.read()` loop, inline `parseAck`, a side-channel `AbortController` for decoder errors, and bespoke lock cleanup. Pushing decode + parse into `pipeThrough`'d transforms collapses all of that: the pipeline does the structural work, `send()` is left with one thing — read until the resolving frame.

**Behaviour**

Identical. All 42 tests pass without modification, including the timeout, caller-abort, MALFORMED_ACK, MALFORMED_FRAME, CONNECTION_CLOSED, NAK exception, and `waitFor` enhanced-mode cases. Bundle size dropped slightly (23.02 → 22.45 kB minified).
