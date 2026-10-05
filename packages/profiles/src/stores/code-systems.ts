import { memoize } from "../memoize";
// @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
import { utgCodeSystemImports } from "../profiles/utg/manifest";
import type { CodeSystemStore } from "../types";
import type {
  CodeSystemDefinition,
  UtgCodeEntry,
  UtgCodeSystemModule,
} from "./types";

const index = memoize((raw: UtgCodeSystemModule): CodeSystemDefinition => {
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
});

/** The loader of UTG code systems. */
export const codeSystems: CodeSystemStore = {
  load: async (id) => {
    const importCodeSystem = utgCodeSystemImports[`vutg/${id}`];
    if (!importCodeSystem) {
      throw new Error(`Unknown codeSystems profile: ${id}`);
    }
    return index(await importCodeSystem());
  },
};
