---
"@glion/profiles": minor
"@glion/annotate-profile-context": patch
"@glion/annotate-profile-fields-code-systems": minor
---

Profiles load per HL7v2 version. `loadFields(version)`, `loadDatatypes(version)`, `loadTables(version)`, and `loadMessageStructures(version)` resolve a `ReadonlyMap` of every profile of that kind in the version, or `undefined` for a version not bundled; `loadCodeSystems()` resolves the UTG code systems. A version loads once, and lookups on the map are synchronous.

`loadSegments(version)` resolves `undefined` for a version not bundled, where it threw, and returns the same definition on every call.

**Breaking:** `profiles`, `createProfiles`, `createLruCache`, the stores and their `load`, `has`, `evict`, and `reset`, and the types `Cache`, `CacheOptions`, `Profiles`, `ProfilesOptions`, `ProfileStore`, `EventProfileStore`, `CodeSystemStore`, `EventLoadOptions`, and `ProfileStoreConfig` are removed. `profiles.fields.load(version, id)` becomes `(await loadFields(version))?.get(id)`, and likewise for the other kinds. `profiles.events.load(version, id)` becomes `loadMessageStructures(version)`, keyed by structure ID; resolve a trigger event with `resolveMessageStructure` or `eventMaps`. `lru-cache` is no longer a dependency.

`@glion/annotate-profile-fields-code-systems` no longer reports a failure to load the UTG code systems as a file message; the error rejects the run.
