---
"@glion/mllp-client": minor
---

Add `waitFor: "final" | "commit"` option to `MllpClient.send()` and handle HL7v2 enhanced acknowledgment mode by default.

**Background**

HL7v2 §2.9.2 defines two acknowledgment modes:

- **Basic mode** — the receiver sends a single final ACK (`AA`/`AE`/`AR`).
- **Enhanced mode** — the receiver sends `CA` (Commit Accept) immediately to confirm receipt and follows up with a separate final ACK on the same connection after processing.

Previously `send()` resolved on the first incoming frame, which meant enhanced-mode receivers caused callers to act on the commit confirmation rather than the final result.

**New default — `waitFor: "final"`**

`send()` now reads frames until one carries a final MSA-1 code (`AA`, `AE`, `AR`, `CE`, `CR`). Intermediate `CA` frames are consumed silently, so enhanced-mode and basic-mode receivers both produce the same shape of result without any caller-side branching.

**New opt-in — `waitFor: "commit"`**

```ts
const commit = await client.send(message, { waitFor: "commit" });
// commit.code === "CA"
```

Resolves on the first frame regardless of code. Use this when the receiver only sends commit-level ACKs, or when the caller wants the commit confirmation without waiting for the final result. The connection closes immediately after the resolving frame, so any later final ACK is not observed.

**Implementation**

- `core/acknowledgment.ts` exports `isFinalAckCode(code)` and a module-private `INTERMEDIATE_ACK_CODES` set (currently just `CA`).
- `core/internal/exchange.ts` replaces `readFirstFrame()` with `readAck(reader, waitFor)`, which loops until the resolving frame arrives. `exchange()` now returns a parsed `Acknowledgment` rather than the raw ACK string — `client.send()` no longer needs a separate `parseAck()` call.
- `SendOptions` gains `waitFor?: "final" | "commit"`. The type is exported from every entry point alongside `signal`.

**Tests (39 → 42)**

Three new core tests:

- `waitFor='final'` (default) consumes a `CA` frame and resolves on the following `AA`.
- `waitFor='commit'` resolves on the first frame even when it is a `CA`.
- `waitFor='final'` (default) times out when only a `CA` arrives and the peer holds the connection.

The `core.test.ts` fake connector now accepts `Uint8Array[]` so a single test can replay multiple frames in sequence.

Behaviour for callers that do not pass `waitFor` is unchanged in basic mode (single final ACK arrives → same shape as before). Callers that previously relied on resolving on a `CA` frame in enhanced mode must now opt in with `waitFor: "commit"`.
