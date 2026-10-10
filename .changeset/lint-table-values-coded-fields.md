---
"@glion/lint-profile-table-values": patch
---

Check a field against its table only when its first component holds the code: a primitive, a coded element (`CE`, `CF`, `CNE`, `CWE`), or a composite whose first component is `ID`, `IS`, or a coded element, such as `MSG` or `CCD`. A composite such as `XPN` or `CX` no longer has its first component checked against the table of a later component, so a v2.6+ patient name in PID-5 is no longer reported as missing from table 0200. A field whose datatype is not bundled, such as v2.2 `CM`, is not checked.
