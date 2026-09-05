---
"@glion/profiles": patch
---

fix: ORS_O06 (v2.4) event schema names the canonical `RESPONSE` group

The v2.4 ORS_O06 event schema misspelled the `RESPONSE` group as `RSPONSE`, so the group was named `ORS_O06/RSPONSE` instead of `ORS_O06/RESPONSE`. Aligned with every other ORS_O06 version (v2.5–v2.8.2), which all use `RESPONSE`. No current in-repo consumer reads these strings, so this is a data-consistency fix with no runtime behavior change today.
