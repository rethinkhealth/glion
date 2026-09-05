---
"@glion/profiles": patch
---

Fix the v2.8/v2.8.1/v2.8.2 `GOL-1`, `ROL-2`, `PRB-1`, and `PTH-1` action-code fields (HL7 item 816), which were bound to table `HL70206` (Segment Action Code) instead of `HL70287` (Problem/Goal Action Code). The wrong binding made `@glion/lint-profile-table-values` reject every valid Problem/Goal code (`AD`/`CO`/`DE`/`LI`/`UC`/`UN`/`UP`) as a false positive and silently accept the Segment-Action-only codes (`A`/`D`/`U`/`X`) as false negatives; every populated v2.8 `GOL`/`ROL`/`PRB`/`PTH` segment produced a wrong lint decision. The binding now matches the prior builds (v2.5.1–v2.7.1) and the HL7 UTG `CodeSystem v2-0287` ("Used in ... the GOL, ROL, PRB and PTH segments").
