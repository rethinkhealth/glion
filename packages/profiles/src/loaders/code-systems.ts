import type { CodeSystemDefinition, CodeSystemEntry } from "./types";

const compileCodeSystem = ({
  codes,
  ...identity
}: CodeSystemEntry): CodeSystemDefinition => ({
  ...identity,
  codes: new Map(codes.map((code) => [code.code, code])),
});

const files = import.meta.glob<readonly CodeSystemEntry[]>(
  "../profiles/utg/code-systems.json",
  { import: "default" }
);

let codeSystems: ReadonlyMap<string, CodeSystemDefinition> | undefined;

/**
 * The UTG code systems, by code system ID such as `"v2-0001"`.
 *
 * Loads and compiles once; later calls resolve the same map.
 */
export const loadCodeSystems = async (): Promise<
  ReadonlyMap<string, CodeSystemDefinition>
> => {
  if (codeSystems) {
    return codeSystems;
  }
  const [entries = []] = await Promise.all(
    Object.values(files).map((load) => load())
  );
  codeSystems ??= new Map(
    entries.map((codeSystem) => [codeSystem.id, compileCodeSystem(codeSystem)])
  );
  return codeSystems;
};
