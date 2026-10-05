import type { EventLoadOptions, ProfileStore } from "./types";

/** Configuration for a profile store. */
export type ProfileStoreConfig<TRaw extends object, T = TRaw> = Readonly<{
  /** The kind of profile, such as `"fields"`, as it appears in errors. */
  namespace: string;
  /** Manifest of lazy import factories keyed by "v{version}/{id}". */
  manifest: Readonly<Record<string, (() => Promise<TRaw>) | undefined>>;
  /** The profile a raw profile compiles to, such as indexed Maps. */
  compile?: (raw: TRaw) => T;
  /** The profile ID `id` resolves to in `version`, such as ADT_A04 → ADT_A01. */
  resolveId?: (version: string, id: string) => string | undefined;
}>;

/**
 * Creates a store that loads the profiles `config` imports.
 *
 * Each raw profile is imported once by the module system and compiled once
 * per process; later loads of it resolve the same value. A failed import is
 * not kept, so the next load imports again.
 */
export const createProfileStore = <TRaw extends object, T = TRaw>(
  config: ProfileStoreConfig<TRaw, T>
): ProfileStore<T> => {
  const { namespace, manifest, compile, resolveId } = config;
  const compiled = new WeakMap<TRaw, T>();

  const load = async (
    version: string,
    id: string,
    options?: EventLoadOptions
  ): Promise<T> => {
    const resolvedId =
      options?.resolve === false ? id : (resolveId?.(version, id) ?? id);
    const factory = manifest[`v${version}/${resolvedId}`];
    if (!factory) {
      throw new Error(
        `Unknown ${namespace} profile: v${version}/${resolvedId}`
      );
    }
    const raw = await factory();
    if (!compile) {
      return raw as unknown as T;
    }
    let profile = compiled.get(raw);
    if (profile === undefined) {
      profile = compile(raw);
      compiled.set(raw, profile);
    }
    return profile;
  };

  return { load };
};
