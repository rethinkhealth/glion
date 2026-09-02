import { createLruCache } from "./cache/lru";
import type { Cache, CacheOptions } from "./cache/types";
import { createProfileStore } from "./store";
import { codeSystemsConfig } from "./stores/code-systems";
import { datatypesConfig } from "./stores/datatypes";
import { eventsConfig } from "./stores/events";
import { fieldsConfig } from "./stores/fields";
import { tablesConfig } from "./stores/tables";
import type { CodeSystemStore, Profiles, ProfilesOptions } from "./types";

// ---------------------------------------------------------------------------
// Cache resolution
// ---------------------------------------------------------------------------

/**
 * Normalize a cache option into a Cache instance or false.
 *
 * - Cache instance -> pass through
 * - CacheOptions -> create LRU
 * - False -> return false (no caching)
 * - Undefined -> return undefined (fall through to default)
 */
const resolveCache = (
  option: Cache | CacheOptions | false | undefined
): Cache | false | undefined => {
  if (option === false) {
    return false;
  }
  if (option === undefined) {
    return;
  }
  // If it has a `get` function, it's a Cache instance
  if (typeof (option as Cache).get === "function") {
    return option as Cache;
  }
  // Otherwise it's CacheOptions
  return createLruCache(option as CacheOptions);
};

// ---------------------------------------------------------------------------
// Wrapped store factories
// ---------------------------------------------------------------------------

/** Create a CodeSystemStore that hides the fixed "utg" version parameter. */
const createCodeSystemStoreWrapped = (
  cache: Cache | false
): CodeSystemStore => {
  const inner = createProfileStore(codeSystemsConfig, cache);
  return {
    evict: (id) => inner.evict("utg", id),
    has: (id) => inner.has("utg", id),
    load: (id) => inner.load("utg", id),
    reset: () => inner.reset(),
  };
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a `Profiles` instance with namespaced stores for events, fields,
 * datatypes, tables, and UTG code systems.
 *
 * Segment definitions are loaded separately via `loadSegments()` from
 * `@glion/profiles/stores/segments` — they are lightweight
 * and don't need store-level caching.
 *
 * @example
 *   ```ts
 *   const profiles = createProfiles();
 *   const def = await profiles.events.load("2.5", "ADT_A01");
 *   const fields = await profiles.fields.load("2.5", "PID");
 *   const table = await profiles.tables.load("2.5", "0001");
 *   const cs = await profiles.codeSystems.load("v2-0001");
 *   ```;
 */
export const createProfiles = (options?: ProfilesOptions): Profiles => {
  const defaultCache = resolveCache(options?.cache) ?? createLruCache();
  const storeCache = (opt?: { cache?: Cache | CacheOptions | false }) =>
    resolveCache(opt?.cache) ?? defaultCache;

  const events = createProfileStore(eventsConfig, storeCache(options?.events));
  const fields = createProfileStore(fieldsConfig, storeCache(options?.fields));
  const datatypes = createProfileStore(
    datatypesConfig,
    storeCache(options?.datatypes)
  );
  const tables = createProfileStore(tablesConfig, storeCache(options?.tables));
  const codeSystems = createCodeSystemStoreWrapped(
    storeCache(options?.codeSystems)
  );

  return {
    codeSystems,
    datatypes,
    events,
    fields,
    reset() {
      events.reset();
      fields.reset();
      datatypes.reset();
      tables.reset();
      codeSystems.reset();
    },
    tables,
  };
};

/** Default profiles instance backed by a built-in LRU cache. */
export const profiles = createProfiles();
