import type { ProfileStoreConfig } from "../store";
import type { ProfileIndex } from "./import-from-index";
import { importFromIndex } from "./import-from-index";
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

const tableIndexes = import.meta.glob<ProfileIndex<TableModule>>(
  "../profiles/v*/tables/index.ts",
  { import: "default" }
);

/** Store configuration for table profiles. */
export const tablesConfig: ProfileStoreConfig<TableModule, TableDefinition> = {
  compile: compileTables,
  importProfile: (version, id) =>
    importFromIndex(tableIndexes, `../profiles/v${version}/tables`, id),
  namespace: "tables",
};
