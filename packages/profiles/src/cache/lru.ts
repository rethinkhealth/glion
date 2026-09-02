import { LRUCache } from "lru-cache";

import type { Cache, CacheOptions } from "./types";

/**
 * Create a Cache backed by an LRU eviction policy.
 *
 * This is the default cache used by `createProfiles()` when no custom
 * cache is provided.
 */
export const createLruCache = ({
  maxEntries = 10_000,
}: CacheOptions = {}): Cache => {
  const store = new LRUCache<string, Promise<unknown>>({ max: maxEntries });

  return {
    clear: () => {
      store.clear();
    },
    delete: (key) => store.delete(key),
    get: (key) => store.get(key),
    has: (key) => store.has(key),
    set: (key, value) => {
      store.set(key, value);
    },
  };
};
