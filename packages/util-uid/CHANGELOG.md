# @glion/util-uid

## 0.20.0

No changes in this release.

## 0.19.0

No changes in this release.

## 0.18.0

### Minor Changes

- dca5259: **BREAKING:** Raise `engines.node` from `>=20` to `>=22` across all `@glion/*` packages and `create-glion`, and drop Node 20.x from the CI test matrix (#728).

  Node 20 reached end-of-life on 2026-04-30 and is no longer tested. The supported and tested runtimes are Node 22 and Node 24.

  Downstream impact: applications that pin Node 20 will need to upgrade to Node 22 or later. Node 22 is in Maintenance LTS until April 2027; Node 24 is the current Active LTS and the recommended target.

- 54bcd6b: New package: time-ordered unique IDs for HL7v2 identifier fields, superseding `@glion/ack`'s `uid()` (ID generation is generic, not acknowledgment vocabulary; the removal from `@glion/ack` lands with the mllp-client rewrite, PR #669). The flagship use case is minting MSH-10 message control IDs: `uid()` generates the ULID idea resized to a 20-character default that fits MSH-10 and other ST identifier fields — 10 Crockford-base32 characters of millisecond timestamp plus 10 of randomness (50 bits per millisecond), stateless, matching the ULID reference `ulid()` semantics, with an alphabet of uppercase alphanumerics (no I/L/O/U, no `-`/`_`) that no legacy engine or verbal readback trips over. `size` must be a positive integer (`RangeError` otherwise); compose prefixes yourself (`"MKE" + uid({ size: 17 })`). No runtime dependencies.
