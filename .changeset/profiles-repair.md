---
"@glion/profiles": minor
---

`repair(schema, segmentIds[, options])` reads a message's segment IDs as the message the event schema accepts with the fewest edits. Each edit is a `missing` segment, one the schema requires and the message does not have, or an `unexpected` segment, one the message has and the schema does not allow there, with its index and the IDs of the groups it sits in. The result also carries the segments grouped as the repaired message groups them. For a message that fits, there are no edits and the groups are the ones `runner` returns.

`MSH PID OBX OBX` against v2.5 `ORU_R01` repairs as one edit: `OBR` missing before segment 3, in `PATIENT_RESULT` > `ORDER_OBSERVATION`.
