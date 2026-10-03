/** The lazy imports of a directory's profiles, by `./{id}.json`. */
export type ProfileIndex<T> = Readonly<Record<string, () => Promise<T>>>;

/**
 * The profile `id` in the directory `dir`, imported through the directory's
 * `index.ts`, or `undefined` when the directory or the profile is not bundled.
 *
 * @param indexes - Lazy imports of directory indexes, by `{dir}/index.ts`.
 * @param dir - The directory, as `indexes` keys it without `/index.ts`.
 * @param id - The profile ID, the file name without `.json`.
 */
export const importFromIndex = async <T>(
  indexes: Readonly<Record<string, () => Promise<ProfileIndex<T>>>>,
  dir: string,
  id: string
): Promise<T | undefined> => {
  const index = await indexes[`${dir}/index.ts`]?.();
  return await index?.[`./${id}.json`]?.();
};
