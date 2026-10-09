---
"@glion/util-visit": patch
---

Index a parent's children the first time one of them is visited, instead of indexing the whole subtree before every `visit()` call. Nested visits and visits that return `SKIP` no longer pay for the parts of the tree they never reach.
