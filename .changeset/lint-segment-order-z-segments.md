---
"@glion/lint-profile-segment-order": minor
---

The rule no longer reports a Z-segment the event schema does not name, such as a `ZPI` after the `PID` of an `ORU_R01`: HL7v2 allows local Z-segments in any message and segment group (v2.5.1 §2.11). Set the new `allowZSegments` option to `false` to report them as unexpected, as before (#868).
