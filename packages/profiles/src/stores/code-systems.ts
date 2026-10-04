import type { ProfileStoreConfig } from "../store";
import type { ProfileIndex } from "./import-from-index";
import { importFromIndex } from "./import-from-index";
import type {
  CodeSystemDefinition,
  UtgCodeEntry,
  UtgCodeSystemModule,
} from "./types";

/** Compile raw UTG code system module into indexed definition. */
const compileCodeSystem = (raw: UtgCodeSystemModule): CodeSystemDefinition => {
  const codes = new Map<string, UtgCodeEntry>();

  for (const code of raw.codes) {
    codes.set(code.code, code);
  }

  const result: CodeSystemDefinition = {
    codes,
    id: raw.id,
    name: raw.name,
    title: raw.title,
    url: raw.url,
  };

  if (raw.oid !== undefined) {
    return { ...result, oid: raw.oid };
  }

  return result;
};

const codeSystemIndexes = import.meta.glob<ProfileIndex<UtgCodeSystemModule>>(
  "../profiles/utg/index.ts",
  { import: "default" }
);

/** Store configuration for UTG code system profiles. */
export const codeSystemsConfig: ProfileStoreConfig<
  UtgCodeSystemModule,
  CodeSystemDefinition
> = {
  compile: compileCodeSystem,
  importProfile: (_version, id) =>
    importFromIndex(codeSystemIndexes, "../profiles/utg", id),
  namespace: "codeSystems",
};
