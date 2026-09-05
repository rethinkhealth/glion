---
"@glion/profiles": patch
---

Restores the `table: "HL70100"` binding on `BLG-1` ("When to Charge") for HL7 v2.6–v2.8.2. PR #544 correctly removed an incorrect `HL70000` reference from `BLG-3` but, in the same diff, also swept the semantically-correct `HL70100` binding off `BLG-1` (CCD.1 "Invocation Event" is bound to table 0100 "Invocation event", codes D/O/R/S/T). With this fix, `lint-profile-table-values` again flags out-of-table `BLG-1` values and `annotate-profile-fields-code-systems` again attaches the `v2-0100` code system on v2.6+, matching v2.5.1.
