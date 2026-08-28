---
"@glion/mllp-ack": minor
---

`@glion/mllp-ack` now owns acknowledgment response construction: `acknowledge()` (with `AcknowledgeOptions` / `SendingInfo`) moves here from `@glion/ack` and is exported for use without the middleware. NAKs no longer carry an ERR segment by default — the ERR layout is HL7v2-version dependent (ELD in ERR-1 before v2.5, ERR-3/ERR-4 after), so the new `errSegment?: (error: AckException) => Segment` middleware option lets the application render the shape its version requires; when omitted, NAKs are MSH + MSA only.
