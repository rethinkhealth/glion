---
"@glion/profiles": patch
---

Fixed the ADT_A60 ("Adverse Reaction Message") segment-order DFA so `PV2` is no longer accepted without a preceding `PV1`. The generated v2.4–v2.7 DFAs allowed a direct `PID → PV2` transition (and, in v2.6/v2.7, also `PID → ARV → PV2`), so out-of-order messages like `MSH EVN PID PV2` were silently accepted by `@glion/lint-profile-events-segments-order`. `PV2` is now only reachable via `PV1`, matching the v2.4 sibling events (`ADT_A01`/`ADT_A61`) and the v2.7.1+ `ADT_A60` DFAs. The `finals` set and the accepted language for valid sequences are unchanged.
