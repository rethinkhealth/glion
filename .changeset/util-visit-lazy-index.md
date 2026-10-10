---
"@glion/util-visit": patch
---

Read `info.index` and `info.sequence` from the node's position when it is visited, instead of indexing the whole subtree before every `visit()` call. Nested visits and visits that return `SKIP` no longer pay for the parts of the tree they never reach, and the position now reflects siblings a visitor inserted or removed earlier in the same visit.
