import { versionOf } from "./loaders/load";

const files = import.meta.glob<Readonly<Record<string, string>>>(
  "./profiles/v*/event-map.json",
  { eager: true, import: "default" }
);

/**
 * The event maps of every bundled HL7v2 version: by version, the message
 * structure ID each trigger event and each structure ID maps to, such as
 * `ADT_A04` → `ADT_A01` in 2.5.
 */
export const eventMaps: ReadonlyMap<
  string,
  ReadonlyMap<string, string>
> = new Map(
  Object.entries(files).map(([path, eventMap]) => [
    versionOf(path),
    new Map(Object.entries(eventMap)),
  ])
);
