---
"@glion/ack": minor
---

Add an optional `raw` attribute to `AckException` (and to `AckExceptionOptions`). Clients that derive an `AckException` from an incoming NAK populate this attribute with the wire-format ACK message, so callers can inspect, re-parse, log, or persist the original payload directly from the thrown error. The attribute is `undefined` for exceptions constructed by application code that has not yet received an ACK.
