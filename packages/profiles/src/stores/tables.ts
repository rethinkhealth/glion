import type { ProfileStore } from "../profiles";
import { memoize } from "../utils";
import { lazyImport } from "./utils";

/** Raw shape exported by generated table modules. */
export type TableModule = Readonly<{
  id: string;
  description: string;
  type: string;
  codes: readonly TableCodeEntry[];
}>;

/** A single code entry within a table. */
export type TableCodeEntry = Readonly<{
  name: string;
  description: string;
}>;

/**
 * Compiled table definition.
 * Returned by `profiles.tables.load()`.
 */
export type TableDefinition = Readonly<{
  id: string;
  description: string;
  type: "user" | "hl7";
  /** O(1) lookup of code entry by name. */
  codes: ReadonlyMap<string, TableCodeEntry>;
}>;

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
    const raw = await lazyImport<TableModule>(
      `../profiles/v${version}/tables/${tableId}.json`
    );
    return raw === undefined ? undefined : index(raw);
  },
};
