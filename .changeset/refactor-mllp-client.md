---
"@glion/mllp-client": minor
---

Refactor `MllpClient` for clarity and stop re-exporting `@glion/ack`.

The internals of `MllpClient.send()` are decomposed into focused, well-documented helpers (`openConnection`, `exchange`, `writeFrame`, `readFirstFrame`, `mapSocketError`, `createDeadline`) so each phase of the connect → write → read-ACK cycle is independently readable and testable. A unified `Deadline` covers all phases of a single `send()`, replacing the previous per-phase timers — the configured `timeout` is now a single budget for the whole round trip.

`@glion/mllp-client` no longer re-exports the `AckException` hierarchy from `@glion/ack`. The single source of truth for those exception types is `@glion/ack` itself; install it alongside `@glion/mllp-client` and `import { AckApplicationError, AckException } from "@glion/ack"` directly. This removes drift risk and matches how `@glion/mllp-ack` already exposes the same hierarchy.

The `parse-ack.ts` source file is renamed to `acknowledgment.ts` to match the entity it owns.
