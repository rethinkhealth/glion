---
"@glion/util-query": patch
---

Fix `select` and `selectAll` to resolve a nested group by bare name, matching how nested segments already resolve.

- Fix `select(root, "ORDER")` returning `null` when the `ORDER` group is nested inside another group
- Fix `ancestors` for a nested group match to end at its direct parent, so `format()` round-trips the result
- Document that the final path name matches at any depth in document order and that `[n]` indexes that order, while group prefixes match direct children only
