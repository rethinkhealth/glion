---
"@glion/profiles": minor
"@glion/annotate-profile-fields": minor
"@glion/lint-profile-field-repetition": patch
"@glion/lint-profile-required-fields": patch
---

A field profile mirrors its row in the HL7v2 segment attribute table. `optionality` is the OPT column, one of `"R"`, `"O"`, `"C"`, `"X"`, `"B"` (backward compatible), and `"W"` (withdrawn), absent where the standard records none. `repetitions` is the RP/# column, the most occurrences the field may have or `"unbounded"`, and `1` when it does not repeat. They replace `required` and `repeatable`; `requiredSequences` lists the fields whose optionality is `"R"`. `@glion/annotate-profile-fields` puts `optionality` and `repetitions` on `field.data` in place of `required` and `repeatable`.

Both come from HL7DB, so fields where it disagrees with the XML schemas change: DG1-2 and PR1-2 are required in v2.3.1 through v2.5.1, OBX-2 in v2.8, and fields such as ERR-6 and OBR-17 repeat a set number of times from v2.6.

**Breaking:** `FieldProfile.required` and `FieldProfile.repeatable` are removed, and so are `required` and `repeatable` on `field.data`. Read `optionality === "R"` in place of `required`, and `repetitions !== 1` in place of `repeatable`.
