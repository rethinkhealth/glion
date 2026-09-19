---
"@glion/to-hl7v2": patch
---

`toHl7v2` serializes segment groups: a grouped tree produces the same text as its flat segments, and a `Group` node on its own serializes as its segments. A root holding groups used to drop every segment inside a group and write only the group's name (#817).
