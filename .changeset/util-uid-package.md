---
"@glion/util-uid": minor
---

New package: time-ordered unique IDs sized for HL7v2 MSH-10, superseding `@glion/ack`'s `uid()` (control-ID generation is generic, not acknowledgment vocabulary; the removal from `@glion/ack` lands with the mllp-client rewrite, PR #669). `uid()` generates the ULID idea resized to the field's 20-character ST limit: 10 Crockford-base32 characters of millisecond timestamp plus 10 of randomness (50 bits per millisecond), stateless — fresh randomness every call, matching the ULID reference `ulid()` semantics — with an alphabet of uppercase alphanumerics (no I/L/O/U, no `-`/`_`) that no legacy engine or verbal readback trips over. `size` must be a positive integer (`RangeError` otherwise); the former `prefix` option stays gone (`"MKE" + uid({ size: 17 })` composes it). No runtime dependencies.
