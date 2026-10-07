---
"@glion/profiles": patch
---

Twelve group names in nine v2.6 event schemas held a space or a `/`, such as `PATIENT VISIT` in `REF_I12` and `PRODUCT/SERVICE LINE_INFO` in `EHC_E10`. They are spelled with `_` now, as v2.5.1 and v2.7 spell them (`PATIENT_VISIT`, `PRODUCT_SERVICE_LINE_INFO`), so a `@glion/util-query` path can name them. The event schema JSON Schema requires a group name to match `^[A-Z][A-Z0-9_]*$` (#866).
