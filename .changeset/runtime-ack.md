---
"@glion/ack": minor
---

Centralized HL7v2 acknowledgment model for the ecosystem: the `AckException` family (`AckApplicationError` / `AckApplicationReject` / `AckCommitError` / `AckCommitReject`) mapping MSA-1 Table 0008, the `acknowledge()` / `toErrSegment()` builders, and the `isAckCode` guard. The server (outbound NAK) and client (inbound NAK) share these types so the two directions cannot drift.
