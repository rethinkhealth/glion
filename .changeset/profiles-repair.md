---
"@glion/profiles": minor
---

`repair(schema, segmentIds[, options])` reads a message's segment IDs as the message the event schema accepts with the fewest edits. Each edit is a `missing` segment, one the schema requires and the message does not have, or an `unexpected` segment, one the message has and the schema does not allow there, with its index and the IDs of the groups it sits in. A message `runner` matches has no edits.

`MSH PID OBX OBX` against v2.5 `ORU_R01` repairs as one edit: `OBR` missing at index 2, in `PATIENT_RESULT` > `ORDER_OBSERVATION`.
