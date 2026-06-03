---
"@glion/ack": minor
---

Add `ackExceptionFor(code, options)` — a factory that maps a Table 0008 reject code (`AE`/`AR`/`CE`/`CR`) to its `AckException` subclass. The single place that owns the code→exception mapping, so a consumer parsing an inbound ACK doesn't re-implement the switch.
