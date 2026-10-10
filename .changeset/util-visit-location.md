---
"@glion/util-visit": minor
---

Give each visited node its HL7v2 location in `VisitInfo`: `segment` (the enclosing `Segment` node) and the 1-based `field`, `repetition`, `component` and `subcomponent` sequences, each `undefined` above its level or when the visit started below it. `visit(tree, "component", (node, ancestors, { segment, field, component }) => …)` reaches `PID-3.4` without walking `ancestors` or nesting a second `visit`.
