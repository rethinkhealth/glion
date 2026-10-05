const files = import.meta.glob<Record<string, string>>(
  "./profiles/v*/event-map.json",
  { eager: true, import: "default" }
);

/**
 * The event maps, by HL7v2 version: each maps a message code and trigger
 * event, such as `"ADT_A04"`, to the ID of its event schema, such as
 * `"ADT_A01"`.
 */
export const eventMaps: Record<
  string,
  Record<string, string>
> = Object.fromEntries(
  Object.entries(files).map(([path, map]) => [
    path.slice("./profiles/v".length, -"/event-map.json".length),
    map,
  ])
);
