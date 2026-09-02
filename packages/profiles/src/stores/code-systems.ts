// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { utgCodeSystemImports } from "../profiles/utg/manifest";
import type { ProfileStoreConfig } from "../store";
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

/** Store configuration for UTG code system profiles. */
export const codeSystemsConfig: ProfileStoreConfig<
  UtgCodeSystemModule,
  CodeSystemDefinition
> = {
  compile: compileCodeSystem,
  manifest: utgCodeSystemImports,
  namespace: "codeSystems",
};
