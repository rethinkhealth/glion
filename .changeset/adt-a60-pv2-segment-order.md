---
"@glion/profiles": patch
---

Fixed the ADT_A60 ("Adverse Reaction Message") segment-order schema so `PV2` is no longer accepted without a preceding `PV1`. The v2.4–v2.7 schemas listed `PV1` and `PV2` as independent optional segments, allowing a direct `PID → PV2` path (and, in v2.6/v2.7, also `PID → ARV → PV2`), so out-of-order messages like `MSH EVN PID PV2` were silently accepted by `@glion/lint-profile-segment-order`. `PV1` and `PV2` are now wrapped in a `VISIT` group with `PV1` required, so `PV2` is only reachable after `PV1` — matching the v2.7.1+ `ADT_A60` schemas. The accepted language for valid sequences is unchanged.
