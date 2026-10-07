---
"@glion/transform-profile-groups": minor
---

New package: a unified plugin that nests a message's segments in the segment groups its event schema defines, such as `PATIENT_RESULT` and `ORDER_OBSERVATION`. It groups by the schema MSH-12 and MSH-9 name, or by the `definition` option: an `EventSchema`, or a function of `{ tree, file }` that returns one. It moves the existing segment nodes without copying them, and leaves the tree flat when the segments do not fit the schema. A Z-segment the schema does not name goes right after the segment before it, in that segment's group; set `allowZSegments: false` to leave such a message flat.
