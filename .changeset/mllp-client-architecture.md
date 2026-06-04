---
"@glion/mllp-client": patch
---

Internal refactor: model the connection lifecycle as a state machine and simplify the package layout. No public API or behaviour change; the full test suite is unchanged and green.

- **`state.ts`** — a pure (no-I/O) XState v5 machine is the authority for the connection lifecycle (`idle → connecting → connected → backingOff → closed`). The client drives it with events and trusts its transition table rather than reading the phase to gate decisions; `connectRejection` / `commitConnected` keep that arbitration in the state module.
- **`util/backoff.ts`** — capped-exponential-with-full-jitter backoff math and the `RetryOptions` shape, kept separate from the machine. Retry is disabled by default (`NO_RETRY`), so `backingOff` is unreachable until a later version enables it.
- **`message.ts`** — the HL7v2 codec (outbound serialize + MSH-10, inbound parse/correlate), separated from the wire.
- **Layout & layering.** A manager layer was explored and then removed: `MllpClient` now owns the lifecycle machine and the per-connection wire directly (read loop, ACK exchange, teardown all inline in `client.ts`), with the Node adapter at `runtime/node.ts`. The wire-agnostic FIFO queue lives at `util/queue.ts`.
