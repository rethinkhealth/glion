---
"@glion/profiles": patch
---

fix: ORS_O06 (v2.4) profile emits the canonical `RESPONSE` group identifier in runner effects

The v2.4 ORS_O06 profile automaton's `effects` table misspelled the `RESPONSE` group as `RSPONSE` (22 occurrences across 16 lines), so `RunnerStepEvent.effects.groupsOpened`/`groupsClosed` emitted `ORS_O06/RSPONSE` instead of `ORS_O06/RESPONSE`. Aligned with every other ORS_O06 version (v2.5–v2.8.2) and the v2.4 sibling profiles, which all use `RESPONSE`. No current in-repo consumer reads these strings, so this is a data-consistency fix with no runtime behavior change today.
