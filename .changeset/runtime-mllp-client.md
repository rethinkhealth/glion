---
"@glion/mllp-client": minor
---

New persistent, single-flight MLLP client for HL7v2. One long-lived connection per instance (`connect()` / `send()` / `close()`), MSA-2↔MSH-10 ACK correlation, and throw-on-NAK via the `@glion/ack` `AckException` family. Client and transport failures surface as a single `MllpClientError` discriminated by `code`. Ships a Node runtime adapter at `@glion/mllp-client/node`.
