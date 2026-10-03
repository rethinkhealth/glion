const files = import.meta.glob<Record<string, string>>(
  "./profiles/v*/structure-map.json",
  { eager: true, import: "default" }
);

/**
 * The structure maps, by HL7v2 version: each maps a message code and trigger
 * event, such as `"ADT_A04"`, and each structure ID, to its message structure
 * ID, such as `"ADT_A01"`.
 */
export const structureMaps: Record<
  string,
  Record<string, string>
> = Object.fromEntries(
  Object.entries(files).map(([path, map]) => [
    path.slice("./profiles/v".length, -"/structure-map.json".length),
    map,
  ])
);
