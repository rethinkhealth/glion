---
"@glion/util-query": patch
---

A path can name a group whose name holds an underscore, such as `PATIENT_RESULT-ORDER_OBSERVATION[2]-OBX-5`. Such paths threw "Invalid HL7 path format" before, which left most of the standard's segment groups unaddressable (#865).
