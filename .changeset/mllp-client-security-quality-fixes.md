---
"@glion/mllp-client": minor
---

Apply security and quality review fixes:

**Security**

- Replace `ClientTlsOptions.rejectUnauthorized: boolean` with `ClientTlsOptions.insecure: true`. Server-certificate verification is now non-negotiable by default — the only way to opt out is the literal value `insecure: true`. There is no `false` form, so a typo cannot silently disable TLS verification. Existing callers that did not set the flag are unaffected; callers that explicitly set `rejectUnauthorized: false` must rename to `insecure: true`.
- Document on the `servername` option that overriding the SNI/cert hostname disables strict hostname verification. Use only when SNI multiplexing requires a different name from the connection target.
- Validate the outbound payload **before** opening any socket. `MllpClient.send()` now MLLP-encodes the message synchronously up-front; a non-`string` / non-`Uint8Array` input throws `MllpClientError(INVALID_INPUT)` without consuming a TCP handshake. Encoder errors no longer mislabel as `CONNECTION_CLOSED`.
- Add an "Errors and PHI" section to the README explaining that `error.message`, `error.cause`, and `AckException.raw` may contain HL7v2 message content and should be redacted before logging to non-PHI-safe destinations. The package never logs these fields itself.

**Quality**

- `MllpClientError.code` is now narrowed to `ClientErrorCode` via `declare readonly code: ClientErrorCode` on the subclass, so consumers get exhaustive `switch` checking on `error.code` without falling back to the inherited `string` type from `MllpError`.
- `Acknowledgment.code` widens from `string` to `AckCodeValue | (string & {})`, preserving auto-completion for the standard MSA-1 codes (`AA`, `AE`, `AR`, `CA`, `CE`, `CR`) while still accepting vendor-specific values.
- `reader.releaseLock()` failures inside `readFirstFrame` now log a one-time `console.warn` instead of being silently swallowed, so a real stream-state regression can't go undetected. The latch is module-scoped — exactly one warning per process.

A follow-up change to preserve vendor-specific ERR-3 codes on the thrown `AckException.errorCode` (instead of coercing them to `ApplicationInternalError`) is tracked in #610 — that touches `@glion/ack` and is scoped separately.
