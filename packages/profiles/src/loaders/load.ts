const VERSION_IN_PATH = /\/v(\d+(?:\.\d+)+)\//;

/**
 * The HL7v2 version a bundled profile path names as a `v{version}` directory,
 * such as `"2.5.1"`.
 *
 * @throws {Error} When `path` names no version, which is a bug.
 */
export const versionOf = (path: string): string => {
  const version = VERSION_IN_PATH.exec(path)?.[1];
  if (version === undefined) {
    throw new Error(
      `Bundled profile path names no version: ${path}. This is a bug.`
    );
  }
  return version;
};

/**
 * A loader of one bundled profile file per HL7v2 version.
 *
 * The loader resolves the compiled file of `version`, or `undefined` for a
 * version no file is bundled for. Each file compiles once; later calls
 * resolve the same value.
 *
 * @param files - Lazy imports of the files, by path; each path names its
 *   version as a `v{version}` directory.
 * @param compile - The value a file's data compiles to.
 */
export const loaderByVersion = <TRaw, T>(
  files: Readonly<Record<string, () => Promise<TRaw>>>,
  compile: (raw: TRaw) => T
): ((version: string) => Promise<T | undefined>) => {
  const imports = new Map(
    Object.entries(files).map(([path, load]) => [versionOf(path), load])
  );
  const compiled = new Map<string, T>();

  return async (version) => {
    const cached = compiled.get(version);
    if (cached !== undefined) {
      return cached;
    }
    const load = imports.get(version);
    if (!load) {
      return;
    }
    const raw = await load();
    // A concurrent first load of the same version may have compiled it while
    // this one awaited the import.
    let value = compiled.get(version);
    if (value === undefined) {
      value = compile(raw);
      compiled.set(version, value);
    }
    return value;
  };
};
