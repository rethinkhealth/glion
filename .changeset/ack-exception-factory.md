---
"@glion/ack": minor
---

Sharpen `@glion/ack` as the owner of Table 0008 vocabulary:

- `isAckNakCode(value)` — type guard for the reject half of Table 0008 (mirrors `isAckCode`); the complement narrows to `AckSuccessCode`.
- `AckException.code` is narrowed from the full Table 0008 union to `AckNakCode` — an acknowledgment exception always represents a NAK, and its type now says so.
- Type names are simplified: `AckCode`, `Hl7ErrorCode`, and `Severity` now double as the union types of their own values (the monorepo-wide const-object pattern); `AckCodeValue`, `Hl7ErrorCodeValue`, and `SeverityValue` are removed.
- `uid()` moves to its own package, `@glion/util-uid` — control-ID generation is generic, not acknowledgment vocabulary. Import it from there; the ID scheme is documented in that package's changeset.
- The package no longer emits ERR segments: `AckException.toErrSegment()` and `acknowledge()`'s `includeErrSegment` option are removed. The ERR layout changed across HL7v2 versions (ELD in ERR-1 before v2.5, ERR-3/ERR-4 after), so a version-agnostic package cannot render one correctly — exceptions still carry `errorCode` and `severity`, and the implementation appends its own version-appropriate ERR to the returned tree.
- `acknowledge()` (with `AcknowledgeOptions` / `SendingInfo`) moves to `@glion/mllp-ack`: `@glion/ack` is now the version-agnostic acknowledgment language — codes, guards, exceptions, `uid` — with `@glion/ast` as its only dependency; response construction lives with the server middleware.
- `AckException` slims to data that belongs on an error: `raw` and `tree` are removed (full HL7v2 payloads on exceptions end up in logs and error trackers — a PHI hazard — and had no consumer), replaced by `text` (MSA-3, the remote system's own diagnostic sentence). Full-fidelity `raw`/`tree` remain on the accepted-response type.
