---
"@glion/util-charset": minor
"@glion/mllp": minor
"@glion/mllp-client": minor
---

Add `@glion/util-charset` and decode inbound HL7v2 wire bytes through it, so a non-UTF-8 feed fails loudly instead of being silently corrupted to U+FFFD (#659).

- Add `@glion/util-charset` with `decodeBytes(bytes)` and `encodeBytes(text)` for UTF-8 — decoding is fatal and strips a leading UTF-8 BOM
- Add the `IncompatibleCharsetError` class (carrying `code: "INCOMPATIBLE_CHARSET"`), thrown by `decodeBytes` on a non-UTF-8 byte-order mark or otherwise-invalid UTF-8
- Change the MLLP server to decode payloads via `decodeBytes`; a non-UTF-8 message now surfaces through `onError` (as an `IncompatibleCharsetError`) instead of being decoded to U+FFFD and acknowledged as valid
- Change the MLLP client to decode ACKs via `decodeBytes`; a non-UTF-8 ACK now rejects with `MllpErrorCode.PARSE_FAILED`, carrying the `IncompatibleCharsetError` on `cause`
