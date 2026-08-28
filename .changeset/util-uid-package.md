---
"@glion/util-uid": minor
---

New package: time-ordered unique IDs for HL7v2 identifier fields, superseding `@glion/ack`'s `uid()` (ID generation is generic, not acknowledgment vocabulary; the removal from `@glion/ack` lands with the mllp-client rewrite, PR #669). The flagship use case is minting MSH-10 message control IDs: `uid()` generates the ULID idea resized to a 20-character default that fits MSH-10 and other ST identifier fields — 10 Crockford-base32 characters of millisecond timestamp plus 10 of randomness (50 bits per millisecond), stateless, matching the ULID reference `ulid()` semantics, with an alphabet of uppercase alphanumerics (no I/L/O/U, no `-`/`_`) that no legacy engine or verbal readback trips over. `size` must be a positive integer (`RangeError` otherwise); compose prefixes yourself (`"MKE" + uid({ size: 17 })`). No runtime dependencies.
