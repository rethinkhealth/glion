import { utgCodeSystemImports } from "../profiles/utg/manifest";
import { compileAll } from "./load";
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

const UTG_KEY_PREFIX = "vutg/";

let codeSystems: Promise<ReadonlyMap<string, CodeSystemDefinition>> | undefined;

/**
 * The UTG code systems, by code system ID such as `"v2-0001"`.
 *
 * Loads and compiles once; later calls return the same map.
 */
export const loadCodeSystems = (): Promise<
  ReadonlyMap<string, CodeSystemDefinition>
> => {
  codeSystems ??= compileAll(
    Object.entries(utgCodeSystemImports).map(
      ([key, load]) => [key.slice(UTG_KEY_PREFIX.length), load] as const
    ),
    compileCodeSystem
  );
  return codeSystems;
};
