---
"@glion/profiles": minor
---

The bundled fields, datatypes, tables, and UTG code systems are JSON, one file per profile, and the event maps one JSON file per HL7v2 version. The build groups the profiles of each version and kind into chunks of about 100 kB of data, and a profile loads only its own chunk the first time it is requested. Importing the package loads 10.1 kB (brotli), down from 30.6 kB, in about 4 ms, down from 26 ms; the first load of a table, field, or code system takes 1–2.5 ms, down from 6–10 ms.

Regenerating the data also brings two corrections: fields no longer reference the placeholder table `HL79999` ("no table for CE" in the HL7 database), and table 0211 and UTG code system `v2-0211` list `ASCII` where they listed `ascii`.

Each profile loads once per process: the module system imports its file once, and the store compiles it once, so later loads resolve the same value. A load that fails is not kept, so the next call imports again.

**Breaking:** the LRU cache is removed with `lru-cache`. `createLruCache`, `Cache`, `CacheOptions`, `createProfiles` and its `ProfilesOptions`, the stores' `has`, `evict`, and `reset`, and `profiles.reset()` are removed; `profiles` holds the stores.
