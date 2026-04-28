---
"@glion/mllp-client": minor
---

Add `@glion/mllp-client`, an MLLP client for sending HL7v2 messages and receiving acknowledgments. Each `MllpClient.send()` call opens a one-shot TCP/TLS connection, MLLP-frames the message, awaits the ACK, and tears the connection down — analogous to a single HTTP request/response. NAK responses (MSA-1 ∈ {AE, AR, CE, CR}) are thrown as the matching `AckException` subclass from `@glion/ack`, so callers can catch the same exception types the receiver-side middleware uses. Each thrown exception carries the original wire-format ACK on its `raw` attribute. Transport-level failures throw `MllpClientError extends MllpError` with codes such as `CONNECTION_REFUSED`, `TIMEOUT`, `CONNECTION_CLOSED`, `MALFORMED_FRAME`, and `MALFORMED_ACK`.
