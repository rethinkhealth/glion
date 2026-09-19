---
"@glion/lint-profile-events-segments-order": patch
"@glion/lint-profile-required-fields": patch
---

Stop descending into fields, components, and subcomponents after checking a segment. Both rules read only segment names and a segment's fields, so the messages they report are unchanged; segments nested in groups are still checked.
