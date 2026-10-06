import { memoize } from "../memoize";
import { lazyImport } from "./utils";

/** Raw shape exported by generated UTG code system modules. */
export type UtgCodeSystemModule = Readonly<{
  id: string;
  url: string;
  oid?: string;
  name: string;
  title: string;
  codes: readonly UtgCodeEntry[];
}>;

/** A single code entry within a UTG code system. */
export type UtgCodeEntry = Readonly<{
  code: string;
  display: string;
  status: string;
}>;

/**
 * Compiled UTG code system definition.
 * Returned by `profiles.codeSystems.load()`.
 */
export type CodeSystemDefinition = Readonly<{
  id: string;
  url: string;
  oid?: string;
  name: string;
  title: string;
  /** O(1) lookup of code entry by code value. */
  codes: ReadonlyMap<string, UtgCodeEntry>;
}>;

/** The loader of UTG code systems, which have no HL7v2 version. */
export type CodeSystemStore = Readonly<{
  /**
   * Loads the code system `id`, such as `"v2-0001"`.
   *
   * @throws {Error} When no code system `id` is bundled.
   */
  load(id: string): Promise<CodeSystemDefinition>;
}>;

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
    const raw = await lazyImport<UtgCodeSystemModule>(
      `../profiles/utg/${id}.json`
    );
    if (!raw) {
      throw new Error(`Unknown codeSystems profile: ${id}`);
    }
    return index(raw);
  },
};
