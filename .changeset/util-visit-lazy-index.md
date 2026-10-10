---
"@glion/util-visit": patch
---

Read `info.index` and `info.sequence` from the node's position when it is visited, instead of indexing the whole subtree before every `visit()` call. Nested visits and visits that return `SKIP` no longer pay for the parts of the tree they never reach, and the position now reflects siblings a visitor inserted or removed earlier in the same visit.

A test object now matches a node's own properties only. A property the node does not own reads as `undefined`, so a key naming an inherited member (`constructor`, `toString`, or an own `__proto__` from `JSON.parse`) matches no node instead of being ignored. The test object's entries are read once, when `visit()` starts.
