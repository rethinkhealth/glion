---
"@glion/lint-profile-withdrawn-fields": minor
"@glion/lint-profile-backward-compatible-fields": minor
"@glion/preset-lint-profile-recommended": minor
---

`@glion/lint-profile-withdrawn-fields` reports a value in a field whose optionality is `W` (withdrawn), such as v2.6 DG1-2 or v2.7 AL1-6. `@glion/lint-profile-backward-compatible-fields` reports a value in a field whose optionality is `B` (backward compatible), such as v2.5.1 DG1-4.

**Breaking:** `@glion/preset-lint-profile-recommended` includes `withdrawn-fields` as an error, so a message that values a withdrawn field now fails. To keep the old behavior, turn the rule off after the preset: `.use(hl7v2LintWithdrawnFields, false)`. The preset does not include `backward-compatible-fields`, since HL7v2 still allows a value in a `B` field.
