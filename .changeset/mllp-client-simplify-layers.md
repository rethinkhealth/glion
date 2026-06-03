---
"@glion/mllp-client": minor
---

Simplify the package layout and orchestration; unwire the send queue (interim).

- **Removed the manager layer.** `MllpClient` now owns the connection lifecycle machine and the wire directly, driving the machine with events and reacting to `closed` via one subscription (it no longer reads the phase to gate events). `createConnectionManager` is gone.
- **12 → 7 modules.** `send.ts`+`response.ts` → `message.ts` (the HL7v2 codec); `reconnect.ts` → `state.ts`; `connection.ts`+`duplex.ts` → `client.ts`; `runtime/node.ts` → `node.ts`. Final layout: `client`, `message`, `state`, `errors`, `queue` (unwired), `index`, `node`.
- **The FIFO send queue is unwired** (`queue.ts` kept but unused) while single-flight is rethought. One send is on the wire at a time; a concurrent `send()` while one is in flight now **rejects with the new `SEND_IN_PROGRESS` code** instead of queueing. Real FIFO concurrency returns when the queue is rewired.
- **Removed `client.queueDepth`** — there is no queue to report.

No change to `connect()`/`send()`/`close()` semantics otherwise: the same typed errors, ACK correlation, NAK→`AckException`, drop/close/timeout disposition, and the close-during-connect race all hold (full test suite green).
