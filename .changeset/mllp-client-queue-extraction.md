---
"@glion/mllp-client": minor
---

Extract the send queue into a standalone, wire-agnostic module and simplify the cancellation model.

- **New `src/queue.ts`** — `createSendQueue()` is a pure deferred-promise FIFO (`enqueue`/`take`/`failAll`/`depth`). It owns no `AbortSignal`, no timer, and no reference to the connection, so it is unit-testable in isolation. The manager keeps the single-flight drain loop, the dial routine, and disposition; it builds the wire ACK deadline at the dispatch instant.
- **`send()` and `connect()` no longer accept an `AbortSignal`.** `MllpSendOptions` is now `{ timeoutMs }` only. The sole cancellation primitives are the per-send timeout and `close()` (which rejects the in-flight and queued sends with `CLOSED`). This matches mainstream single-flight clients and removes all `AbortSignal.any` plumbing.
- **`timeoutMs` is now a wire-only ACK deadline.** The clock starts when a send reaches the wire, not when it is enqueued, so a send waiting behind others may wait longer than `timeoutMs` before its deadline begins. Previously the deadline spanned the queue wait.
- A connection's in-flight send still rejects `DROPPED` on a drop; queued-but-unsent sends still reject `CLOSED`. `SEND_ABORTED` and `CONNECT_ABORTED` remain in `MllpErrorCode` but are no longer produced by a caller signal (`CONNECT_ABORTED` is still raised when `close()` interrupts a connect).
