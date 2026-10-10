---
"@glion/profiles": minor
"@glion/annotate-profile-context": patch
"@glion/annotate-profile-fields": patch
"@glion/lint-profile-extra-components": patch
"@glion/lint-profile-required-components": patch
---

Give every v2.6 through v2.8.2 field profile its HL7v2 sequence. Fields after a withdrawn one had the sequence of their place in the list, so `bySequence` returned the wrong field and the profile rules checked a valid message against another field's datatype, table, and optionality (#916).

Every field the standard lists is present at its sequence, including the withdrawn fields the XML schemas leave out, such as DG1-2 from v2.6 and the UB1 segment from v2.7. v2.5.1 OBX-23 to OBX-25 hold the profiles that sat at OBX-20 to OBX-22, and v2.8.1 RF1-18 (Remaining Benefit Amount), which the v2.8.1 sources omit, is present as v2.8 and v2.8.2 list it.

**Breaking:** `FieldProfile.datatype` is optional. A withdrawn field the standard gives no datatype has none, and the component rules skip such fields. Code that reads `field.datatype` must handle `undefined`.
