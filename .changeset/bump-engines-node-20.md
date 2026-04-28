---
"@glion/ack": minor
"@glion/annotate-delimiters": minor
"@glion/annotate-profile-context": minor
"@glion/annotate-profile-datatypes": minor
"@glion/annotate-profile-fields": minor
"@glion/annotate-profile-fields-code-systems": minor
"@glion/annotate-profile-segments": minor
"@glion/ast": minor
"@glion/builder": minor
"@glion/cli": minor
"@glion/config": minor
"@glion/decode-escapes": minor
"@glion/encode-escapes": minor
"@glion/hl7v2": minor
"@glion/jsonify": minor
"@glion/lint-max-message-size": minor
"@glion/lint-message-version": minor
"@glion/lint-no-trailing-empty-field": minor
"@glion/lint-profile-events-segments-order": minor
"@glion/lint-profile-extra-components": minor
"@glion/lint-profile-extra-fields": minor
"@glion/lint-profile-field-max-length": minor
"@glion/lint-profile-field-repetition": minor
"@glion/lint-profile-required-components": minor
"@glion/lint-profile-required-fields": minor
"@glion/lint-profile-table-values": minor
"@glion/lint-required-message-header": minor
"@glion/lint-segment-header-length": minor
"@glion/mllp": minor
"@glion/mllp-ack": minor
"@glion/mllp-client": minor
"@glion/mllp-transport": minor
"@glion/parser": minor
"@glion/preset-annotate-profile-recommended": minor
"@glion/preset-lint-profile-recommended": minor
"@glion/preset-lint-recommended": minor
"@glion/profiles": minor
"@glion/to-hl7v2": minor
"@glion/util-query": minor
"@glion/util-semver": minor
"@glion/util-timestamp": minor
"@glion/util-visit": minor
"@glion/utils": minor
---

Bump `engines.node` from `>=18` to `>=20` across all `@glion/*` packages.

Node 18 reaches end-of-life in April 2026; new code in this repo uses
Node 20+ APIs (notably `AbortSignal.any()` in `@glion/mllp-client`),
and standardising on a single supported Node line keeps the
dependency matrix coherent across the monorepo.

Downstream impact: applications that pin Node 18 will need to upgrade
to Node 20 or later. Node 20 is itself in active LTS and remains
supported until April 2026; Node 22 is the current LTS.
