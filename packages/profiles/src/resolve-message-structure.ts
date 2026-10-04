import { structureMaps } from "./profiles/structure-map-manifest";

/**
 * The message structure ID the structure maps give `messageCode` and
 * `triggerEvent` in `version`, such as `"ADT_A01"` for `ADT` `A04` in 2.5.
 *
 * Synchronous. Loads no profile.
 *
 * @returns The structure ID, or `undefined` when the structure maps have no entry
 *   for the combination.
 */
export const resolveMessageStructure = (
  version: string,
  messageCode: string,
  triggerEvent: string
): string | undefined => {
  const candidate = `${messageCode}_${triggerEvent}`;
  return structureMaps[version]?.[candidate];
};
