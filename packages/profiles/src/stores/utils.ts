// A profile loads in two lazy steps: the index of its directory, then the
// profile's JSON. A glob over the JSON files themselves would put the path of
// every bundled profile in the package's entry chunk, so importing the package
// would load the paths of all of them; this glob over the indexes holds one
// path per directory, and a directory's index loads the first time one of its
// profiles does.
const indexes = import.meta.glob<
  Readonly<Record<string, () => Promise<unknown>>>
>("../profiles/**/index.ts", { import: "default" });

/**
 * The JSON profile at `path`, imported on first use, or `undefined` when no
 * profile is bundled there.
 *
 * @param path - The profile's path relative to `src/stores`, as `import()`
 *   takes it, such as `"../profiles/v2.5/fields/PID.json"`.
 */
export const lazyImport = async <T>(path: string): Promise<T | undefined> => {
  const slash = path.lastIndexOf("/");
  const index = await indexes[`${path.slice(0, slash)}/index.ts`]?.();
  return (await index?.[`.${path.slice(slash)}`]?.()) as T | undefined;
};
