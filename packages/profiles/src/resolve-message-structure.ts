import { eventMaps } from "./profiles/event-map-manifest";

/**
 * Resolve the canonical message structure ID from version, message code,
 * and trigger event using the built-in event maps.
 *
 * This is a synchronous, pure lookup — it does not load profiles or
 * mutate any state. Use it when you need the structure ID string
 * without loading the full DFA definition.
 *
 * @returns The canonical structure ID (e.g. `"ADT_A01"`), or `undefined`
 *   if the combination is not found in the event maps.
 */
export const resolveMessageStructure = (
  version: string,
  messageCode: string,
  triggerEvent: string
): string | undefined => {
  const candidate = `${messageCode}_${triggerEvent}`;
  return eventMaps[version]?.[candidate];
};
