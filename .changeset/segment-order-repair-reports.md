---
"@glion/lint-profile-segment-order": minor
---

When a message does not fit its event schema, the rule reports each edit of the repair with the fewest edits, where it reported the first segment that did not fit. A segment the schema requires and the message does not have is reported as `Missing segment 'OBR' (before 'OBX', in PATIENT_RESULT > ORDER_OBSERVATION)`, on the segment it comes before, or as `Missing segment 'PV1' (at the end)`, on the message. A segment the schema does not allow there is reported as `Unexpected segment 'PV1' (after 'OBX', in PATIENT_RESULT > ORDER_OBSERVATION > OBSERVATION)`, on that segment. The `Expected:` lists and `Message ended prematurely` are gone.

An `ADT_A01` with only `MSH` and `PID` now reports both `EVN` and `PV1` missing. A segment after the end of the message is reported as `Unexpected segment 'PID' (after 'DSC')`. A segment in place of a required one is reported as unexpected, next to the required one it displaces, reported as missing: `MSH PIDX PV` against `ADT_A01` reports `EVN` missing and `PIDX` unexpected, then `PID` missing and `PV` unexpected, then `PV1` missing at the end.
