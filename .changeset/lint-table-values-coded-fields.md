---
"@glion/lint-profile-table-values": patch
---

Check a field against its table only when its datatype is primitive or a coded element (`CE`, `CF`, `CNE`, `CWE`). A composite such as `XPN` or `CX` no longer has its first component checked against the table of a later component, so a v2.6+ patient name in PID-5 is no longer reported as missing from table 0200.
