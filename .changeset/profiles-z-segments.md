---
"@glion/profiles": minor
---

`runner(schema, segmentIds, options)` accepts a Z-segment, a segment ID that starts with `Z`, that the schema does not name at any position, as HL7v2 allows local Z-segments in any message and segment group (v2.5.1 §2.11). It groups such a segment right after the segment before it, in that segment's group. A Z-segment the schema names is matched like any other segment. Pass `{ allowZSegments: false }` to treat an unnamed Z-segment as a mismatch, as before (#868).
