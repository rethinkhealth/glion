import type { Cache } from "./cache/types";
import type { EventLoadOptions, ProfileStore } from "./types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Configuration for a profile store. */
export type ProfileStoreConfig<TRaw, T = TRaw> = Readonly<{
  /** Namespace for cache keys (e.g., "events", "fields", "datatypes"). */
  namespace: string;
  /** Manifest of lazy import factories keyed by "v{version}/{id}". */
  manifest: Readonly<Record<string, (() => Promise<TRaw>) | undefined>>;
  /** Optional post-import transform (e.g., build indexed Maps from raw arrays). */
  compile?: (raw: TRaw) => T;
  /** Optional ID resolver for alias support (e.g., ADT_A04 → ADT_A01). */
  resolveId?: (version: string, id: string) => string | undefined;
}>;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a typed, cached profile store backed by a manifest of lazy imports.
 *
 * Each store tracks its own cache keys (via `ownKeys`) so that `reset()` only
 * flushes entries belonging to this store, even on a shared cache.
 */
export const createProfileStore = <TRaw, T = TRaw>(
  config: ProfileStoreConfig<TRaw, T>,
  cache: Cache | false
): ProfileStore<T> => {
  const { namespace, manifest, compile, resolveId } = config;
  const ownKeys = new Set<string>();

  const toKey = (version: string, id: string) =>
    `${namespace}:${version}/${id}`;

  const importAndCompile = async (version: string, id: string): Promise<T> => {
    const manifestKey = `v${version}/${id}`;
    const factory = manifest[manifestKey];
    if (!factory) {
      throw new Error(`Unknown ${namespace} profile: ${manifestKey}`);
    }
    const raw = await factory();
    return compile ? compile(raw) : (raw as unknown as T);
  };

  const load = (
    version: string,
    id: string,
    options?: EventLoadOptions
  ): Promise<T> => {
    const resolvedId =
      options?.resolve === false ? id : (resolveId?.(version, id) ?? id);
    const cacheKey = toKey(version, resolvedId);

    if (cache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        return cached as Promise<T>;
      }
    }

    const promise = importAndCompile(version, resolvedId);

    if (cache) {
      cache.set(cacheKey, promise);
      ownKeys.add(cacheKey);

      // Evict on failure — don't permanently cache rejected promises.
      // The error handler is intentionally detached; the caller observes the
      // original `promise` rejection, not this cleanup chain.
      // oxlint-disable-next-line promise/prefer-await-to-then
      const _evict = promise.catch(() => {
        cache.delete(cacheKey);
        ownKeys.delete(cacheKey);
      });
    }

    return promise;
  };

  return {
    evict: (version, id) => {
      const key = toKey(version, id);
      if (cache) {
        cache.delete(key);
      }
      ownKeys.delete(key);
    },
    has: (version, id) => (cache ? cache.has(toKey(version, id)) : false),
    load,
    reset: () => {
      if (cache) {
        for (const key of ownKeys) {
          cache.delete(key);
        }
      }
      ownKeys.clear();
    },
  };
};
