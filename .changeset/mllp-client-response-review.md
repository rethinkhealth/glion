---
"@glion/mllp-client": minor
---

Review-driven cleanups to the response/codec and connect error path:

- **`MllpClientResponse` drops `requestControlId`** — keep `controlId` (the peer's MSA-2). The caller already knows the id it sent, so carrying both was redundant.
- **`parseResponse` is now a pure codec:** `parseResponse(rawAck, expectedControlId): ParsedAck` returns the message-level fields (`code`/`controlId`/`tree`/`raw`); the connection attaches the wire timing (`timestamp`/`durationMs`). Replaces the `ParseInput` bag that mixed timing into the codec's input.
- **NAK construction delegated to `@glion/ack`** — `parseResponse` calls the new `ackExceptionFor(code, options)` instead of switching on `AE`/`AR`/`CE`/`CR` itself.
- The non-UTF-8 ACK error message no longer over-claims the cause ("could not decode … as UTF-8" instead of asserting the charset).
- `connect()`'s "which error" decision (`CLOSED` vs `ALREADY_CONNECTED`) moved into the state module (`connectRejection`), so the client no longer branches on the phase in its error handling.
