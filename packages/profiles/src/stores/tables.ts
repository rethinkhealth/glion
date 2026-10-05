import { memoize } from "../memoize";
import { tableImports } from "../profiles/table-manifest";
import type { ProfileStore } from "../types";
import type { TableCodeEntry, TableDefinition, TableModule } from "./types";

const index = memoize((raw: TableModule): TableDefinition => {
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
});

/** The loader of table profiles. */
export const tables: ProfileStore<TableDefinition> = {
  load: async (version, tableId) => {
    const key = `v${version}/${tableId}`;
    const importTable = tableImports[key];
    if (!importTable) {
      throw new Error(`Unknown tables profile: ${key}`);
    }
    return index(await importTable());
  },
};
