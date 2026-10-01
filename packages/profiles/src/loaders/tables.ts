import { tableImports } from "../profiles/table-manifest";
import { loaderByVersion, versionAndId } from "./load";
import type { TableCodeEntry, TableDefinition, TableModule } from "./types";

/** Compile raw table module into indexed definition. */
const compileTables = (raw: TableModule): TableDefinition => {
  const codes = new Map<string, TableCodeEntry>();

  for (const code of raw.codes) {
    codes.set(code.name, code);
  }

  return {
    codes,
    description: raw.description,
    id: raw.id,
    type: raw.type as "user" | "hl7",
  };
};

/**
 * The tables of an HL7v2 version, by table number such as `"0001"`, or
 * `undefined` for a version not bundled.
 */
export const loadTables: (
  version: string
) => Promise<ReadonlyMap<string, TableDefinition> | undefined> =
  loaderByVersion(tableImports, versionAndId, compileTables);
