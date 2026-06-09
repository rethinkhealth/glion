---
"@glion/mllp-client": minor
---

Collapse the ACK-response error codes into a single, user-facing `INVALID_RESPONSE`.

The three implementation-named codes for an unusable reply — `PARSE_FAILED`, `UNKNOWN_ACK_CODE`, and `CORRELATION_MISMATCH` — are replaced by one `MllpErrorCode.INVALID_RESPONSE`. From the caller's perspective they were all the same outcome ("the peer replied, but the reply was not a usable acknowledgment of the message I sent"); `PARSE_FAILED` in particular leaked that the client runs a parser rather than describing anything the caller can act on.

`INVALID_RESPONSE` covers every way the reply can be unusable:

- undecodable bytes (non-UTF-8 — the `@glion/util-charset` error is on `cause`),
- no MSA-1 acknowledgment code,
- a non-standard MSA-1 code (not one of `AA`/`AE`/`AR`/`CA`/`CE`/`CR`),
- an MSA-2 that doesn't match the request's MSH-10 (typically a late ACK from a previously-timed-out send).

The specific reason is in the error's `message`; branch on `code` for the bucket, read `message`/`cause` for the detail. A NAK still throws an `@glion/ack` `AckException`, unchanged.

Migration: replace any `MllpErrorCode.PARSE_FAILED` / `UNKNOWN_ACK_CODE` / `CORRELATION_MISMATCH` branch with `MllpErrorCode.INVALID_RESPONSE`. If you previously distinguished the three, inspect `error.message` (and `error.cause` for the charset case) instead.
