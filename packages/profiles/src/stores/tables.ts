import { tableImports } from "../profiles/table-manifest";
import type { ProfileStoreConfig } from "../store";
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

/** Store configuration for table profiles. */
export const tablesConfig: ProfileStoreConfig<TableModule, TableDefinition> = {
  compile: compileTables,
  manifest: tableImports,
  namespace: "tables",
};
