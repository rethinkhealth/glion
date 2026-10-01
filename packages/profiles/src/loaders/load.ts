/** A lazy import of one bundled profile file. */
export type ProfileImport<TRaw> = () => Promise<TRaw>;

/** The profiles `imports` lists, compiled, by id. */
export const compileAll = async <TRaw, T>(
  imports: readonly (readonly [id: string, load: ProfileImport<TRaw>])[],
  compile: (raw: TRaw) => T
): Promise<ReadonlyMap<string, T>> =>
  new Map(
    await Promise.all(
      imports.map(async ([id, load]) => [id, compile(await load())] as const)
    )
  );

/**
 * A loader of every profile `manifest` holds for one HL7v2 version, compiled,
 * by id.
 *
 * Each version loads and compiles once; later calls return the same map. The
 * loader resolves `undefined` for a version `manifest` holds nothing for.
 *
 * @param manifest - Lazy imports, by manifest key.
 * @param keyOf - The version and id a manifest key names.
 * @param compile - The profile a raw module holds.
 */
export const loaderByVersion = <TRaw, T>(
  manifest: Readonly<Record<string, ProfileImport<TRaw>>>,
  keyOf: (key: string) => readonly [version: string, id: string],
  compile: (raw: TRaw) => T
): ((version: string) => Promise<ReadonlyMap<string, T> | undefined>) => {
  let imports:
    | Map<string, (readonly [string, ProfileImport<TRaw>])[]>
    | undefined;
  const loaded = new Map<string, Promise<ReadonlyMap<string, T>>>();

  const importsOf = (version: string) => {
    if (!imports) {
      imports = new Map();
      for (const [key, load] of Object.entries(manifest)) {
        const [keyVersion, id] = keyOf(key);
        let entries = imports.get(keyVersion);
        if (!entries) {
          entries = [];
          imports.set(keyVersion, entries);
        }
        entries.push([id, load]);
      }
    }
    return imports.get(version);
  };

  return async (version) => {
    let profiles = loaded.get(version);
    if (!profiles) {
      const entries = importsOf(version);
      if (!entries) {
        return;
      }
      profiles = compileAll(entries, compile);
      loaded.set(version, profiles);
    }
    return await profiles;
  };
};

/** The version and id a `v{version}/{id}` manifest key names. */
export const versionAndId = (key: string): readonly [string, string] => {
  const slash = key.indexOf("/");
  return [key.slice(1, slash), key.slice(slash + 1)];
};
