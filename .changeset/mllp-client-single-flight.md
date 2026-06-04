---
"@glion/mllp-client": minor
---

Replace the FIFO send queue with single-flight, and simplify the cancellation model.

- **One send is on the wire at a time.** The FIFO send queue shipped in 0.17.0 is unwired; a concurrent `send()` while one is in flight now **rejects with the new `SEND_IN_PROGRESS` code** instead of queueing. Real FIFO concurrency returns in a later version once the model is fully designed.
- **Removed `client.queueDepth`** — there is no queue to report.
- **`send()` and `connect()` no longer accept an `AbortSignal`.** `MllpSendOptions` is `{ timeoutMs }` only. The cancellation primitives are the per-send `timeoutMs` and `close()` (which rejects the in-flight send with `CLOSED`). This matches mainstream single-flight clients and removes the `AbortSignal.any` plumbing.
- **`timeoutMs` is the wire-level ACK deadline** — the clock starts when a send reaches the wire.

The pure FIFO queue lives on as a standalone, wire-agnostic module (`util/queue.ts`, unit-tested in isolation) but is not wired into the client. The same typed errors, ACK correlation, NAK → `AckException`, and drop/close/timeout disposition otherwise hold.
