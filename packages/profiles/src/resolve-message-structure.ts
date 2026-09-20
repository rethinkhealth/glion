import { eventMaps } from "./profiles/event-map-manifest";

/**
 * The message structure ID the event maps give `messageCode` and
 * `triggerEvent` in `version`, such as `"ADT_A01"` for `ADT` `A04` in 2.5.
 *
 * Synchronous. Loads no profile.
 *
 * @returns The structure ID, or `undefined` when the event maps have no entry
 *   for the combination.
 */
export const resolveMessageStructure = (
  version: string,
  messageCode: string,
  triggerEvent: string
): string | undefined => {
  const candidate = `${messageCode}_${triggerEvent}`;
  return eventMaps[version]?.[candidate];
};
