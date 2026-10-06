---
"@glion/profiles": minor
---

Each profile loads once per process: the module system imports its file once, and the store compiles it once, so later loads resolve the same value. A load that fails is not kept, so the next call imports again.

**Breaking:** the LRU cache is removed with `lru-cache`. `createLruCache`, `Cache`, `CacheOptions`, `createProfiles` and its `ProfilesOptions`, the stores' `has`, `evict`, and `reset`, and `profiles.reset()` are removed; `profiles` holds the stores.

**Breaking:** `createProfileStore`, `ProfileStoreConfig`, and `EventProfileStore` are removed; `profiles.events` is a `ProfileStore<Definition>`. `events.load` takes no options: an event always resolves to its message structure, and `EventLoadOptions` is removed.
