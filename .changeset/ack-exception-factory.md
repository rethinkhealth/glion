---
"@glion/ack": minor
---

- Add `ackExceptionFor(code, options)` — a factory that maps a Table 0008 reject code (`AE`/`AR`/`CE`/`CR`) to its `AckException` subclass. The single place that owns the code→exception mapping, so a consumer parsing an inbound ACK doesn't re-implement the switch.
- Add `isAckNakCode(value)` — a type guard for the reject half of Table 0008 (mirrors the existing `isAckCode`). Lets a consumer detect a NAK without hand-writing the `AE`/`AR`/`CE`/`CR` disjunction, and narrows the complement to `AckSuccessCode`.
