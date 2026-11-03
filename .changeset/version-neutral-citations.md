---
"@glion/lint-profile-segment-order": patch
"@glion/transform-profile-groups": patch
"@glion/transform-trim-trailing-fields": patch
---

State the Z-segment and empty field rules as every HL7v2 version has them, in place of a section of one version.

- Change the description of `allowZSegments`: every version reserves Segment IDs that start with `Z` for local use, and tells the recipient to ignore a segment it does not expect
