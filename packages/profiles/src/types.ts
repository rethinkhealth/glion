import type { Definition } from "./automata/types";
import type { Cache, CacheOptions } from "./cache/types";
import type {
  CodeSystemDefinition,
  DatatypeDefinition,
  FieldDefinition,
  TableDefinition,
} from "./stores/types";

// ---------------------------------------------------------------------------
// Load options
// ---------------------------------------------------------------------------

/** Options for event profile loading. */
export type EventLoadOptions = Readonly<{
  /**
   * Whether to resolve trigger event aliases to canonical structure IDs.
   * Default: true.
   *
   * Example: load("2.5", "ADT_A04") with resolve=true returns ADT_A01's DFA.
   * With resolve=false, it looks up ADT_A04 directly (which may not exist).
   */
  resolve?: boolean;
}>;

// ---------------------------------------------------------------------------
// Profile store
// ---------------------------------------------------------------------------

/** A typed, cached loader for a single profile type. */
export type ProfileStore<T> = Readonly<{
  /** Load a profile by version and id. Returns a cached result when available. */
  load(version: string, id: string): Promise<T>;
  /** Check whether a profile is in the cache. */
  has(version: string, id: string): boolean;
  /** Remove a single entry from the cache. */
  evict(version: string, id: string): void;
  /** Flush all cached entries for this store. */
  reset(): void;
}>;

/** Events store with alias resolution support. */
export type EventProfileStore = Readonly<{
  /** Load a DFA definition. Resolves trigger event aliases by default. */
  load(
    version: string,
    id: string,
    options?: EventLoadOptions
  ): Promise<Definition>;
  /** Check whether a profile is in the cache. */
  has(version: string, id: string): boolean;
  /** Remove a single entry from the cache. */
  evict(version: string, id: string): void;
  /** Flush all cached event entries. */
  reset(): void;
}>;

/** UTG code system store — not versioned by HL7v2 version. */
export type CodeSystemStore = Readonly<{
  /** Load a UTG code system by id (e.g., "v2-0001"). */
  load(id: string): Promise<CodeSystemDefinition>;
  /** Check whether a code system is in the cache. */
  has(id: string): boolean;
  /** Remove a single entry from the cache. */
  evict(id: string): void;
  /** Flush all cached code system entries. */
  reset(): void;
}>;

// ---------------------------------------------------------------------------
// Profiles (top-level)
// ---------------------------------------------------------------------------

/** Configuration for `createProfiles()`. */
export type ProfilesOptions = Readonly<{
  /** Shared cache for all stores. Default: built-in LRU (10,000 entries). */
  cache?: Cache | CacheOptions | false;
  /** Override cache for the events store. */
  events?: { cache?: Cache | CacheOptions | false };
  /** Override cache for the fields store. */
  fields?: { cache?: Cache | CacheOptions | false };
  /** Override cache for the datatypes store. */
  datatypes?: { cache?: Cache | CacheOptions | false };
  /** Override cache for the tables store. */
  tables?: { cache?: Cache | CacheOptions | false };
  /** Override cache for the code systems store. */
  codeSystems?: { cache?: Cache | CacheOptions | false };
}>;

/** The top-level profiles API returned by `createProfiles()`. */
export type Profiles = Readonly<{
  /** DFA definitions for message structure validation. */
  events: EventProfileStore;
  /** Segment field metadata (required, repeatable, maxLength, datatype). */
  fields: ProfileStore<FieldDefinition>;
  /** Component structure and constraints for datatypes. */
  datatypes: ProfileStore<DatatypeDefinition>;
  /** HL7-defined and user-defined table value sets. */
  tables: ProfileStore<TableDefinition>;
  /** UTG code systems (cumulative, not versioned by HL7v2 version). */
  codeSystems: CodeSystemStore;
  /** Flush all cached entries across all stores. */
  reset(): void;
}>;
