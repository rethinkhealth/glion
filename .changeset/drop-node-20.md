---
"@glion/ack": minor
"@glion/annotate-delimiters": minor
"@glion/annotate-profile-context": minor
"@glion/annotate-profile-datatypes": minor
"@glion/annotate-profile-fields-code-systems": minor
"@glion/annotate-profile-fields": minor
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
"@glion/mllp-client": minor
"@glion/mllp-codec": minor
"@glion/mllp": minor
"@glion/parser": minor
"@glion/preset-annotate-profile-recommended": minor
"@glion/preset-lint-profile-recommended": minor
"@glion/preset-lint-recommended": minor
"@glion/profiles": minor
"@glion/to-hl7v2": minor
"@glion/util-charset": minor
"@glion/util-query": minor
"@glion/util-semver": minor
"@glion/util-timestamp": minor
"@glion/util-uid": minor
"@glion/util-visit": minor
"@glion/utils": minor
"create-glion": minor
---

**BREAKING:** Raise `engines.node` from `>=20` to `>=22` across all `@glion/*` packages and `create-glion`, and drop Node 20.x from the CI test matrix (#728).

Node 20 reached end-of-life on 2026-04-30 and is no longer tested. The supported and tested runtimes are Node 22 and Node 24.

Downstream impact: applications that pin Node 20 will need to upgrade to Node 22 or later. Node 22 is in Maintenance LTS until April 2027; Node 24 is the current Active LTS and the recommended target.
