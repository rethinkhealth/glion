import { eventMaps } from "./profiles/event-map-manifest";

/**
 * The message structure ID the event map of `version` gives `key`, a trigger
 * event such as `"ADT_A04"` or a structure ID, or `undefined` when it has none.
 *
 * Reads own entries only, so a key read from a message never reaches
 * `Object.prototype`.
 */
export const eventMapEntry = (
  version: string,
  key: string
): string | undefined => {
  const eventMap = Object.hasOwn(eventMaps, version)
    ? eventMaps[version]
    : undefined;
  return eventMap && Object.hasOwn(eventMap, key) ? eventMap[key] : undefined;
};
