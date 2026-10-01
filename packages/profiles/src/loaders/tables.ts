import { loaderByVersion } from "./load";
import type { TableDefinition, TableEntry } from "./types";

const compileTable = ({
  id,
  description,
  type,
  codes,
}: TableEntry): TableDefinition => ({
  codes: new Map(codes.map((code) => [code.name, code])),
  description,
  id,
  type,
});

/**
 * The tables of an HL7v2 version, by table number such as `"0001"`, or
 * `undefined` for a version not bundled.
 */
export const loadTables: (
  version: string
) => Promise<ReadonlyMap<string, TableDefinition> | undefined> =
  loaderByVersion(
    import.meta.glob<readonly TableEntry[]>("../profiles/v*/tables.json", {
      import: "default",
    }),
    (tables) => new Map(tables.map((table) => [table.id, compileTable(table)]))
  );
