---
"@glion/profiles": patch
---

Importing `@glion/profiles` no longer loads profile data. Profiles are bundled into one chunk per HL7 version and kind (`events-v2.5.js`, `fields-v2.5.js`, …) plus one for UTG code systems, and a chunk loads the first time a profile in it is requested. Previously every chunk that shared a module with a manifest or event map loaded at import: 50 of 173 files, 9.2 MB. Importing the package now loads 2 files, 0.8 MB.
