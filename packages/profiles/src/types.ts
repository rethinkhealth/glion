/**
 * The public types: event schemas and what `runner()` returns, then the
 * profile stores.
 *
 * @module
 */

import type { Cache, CacheOptions } from "./cache/types";
import type {
  CodeSystemDefinition,
  DatatypeDefinition,
  FieldDefinition,
  TableDefinition,
} from "./stores/types";

// ---------------------------------------------------------------------------
// Event schema
// ---------------------------------------------------------------------------

/**
 * The schema of an HL7v2 event: its message structure, such as `ORU_R01`, as
 * the standard defines it.
 */
export type EventSchema = Readonly<{
  /** The JSON Schema this event schema conforms to. */
  $schema?: string;
  /** The message structure ID, as carried in MSH-9.3, such as `ORU_R01`. */
  id: string;
  /** The top-level elements, in the standard's order. At least one. */
  elements: readonly EventSchemaElement[];
}>;

/**
 * One element of an event schema, discriminated by `type`: a segment, a
 * group, or a choice.
 */
export type EventSchemaElement = SegmentElement | GroupElement | ChoiceElement;

/**
 * How often an element occurs. Every element carries both flags: an element
 * that is neither optional nor repeating occurs exactly once.
 */
export type Occurrence = Readonly<{
  /** The standard's `[ ]`: the element may be absent. */
  optional: boolean;
  /** The standard's `{ }`: the element may occur more than once. */
  repeating: boolean;
}>;

/** A segment, such as `PID`. */
export type SegmentElement = Occurrence &
  Readonly<{
    type: "segment";
    /** The segment ID, such as `PID`. `Hxx` stands for any segment. */
    name: string;
  }>;

/** A segment group, such as `PATIENT_RESULT`. */
export type GroupElement = Occurrence &
  Readonly<{
    type: "group";
    /** The group name, such as `PATIENT_RESULT`. */
    name: string;
    /** The elements of the group, in order. At least one. */
    elements: readonly EventSchemaElement[];
  }>;

/** A choice, the standard's `< A | B >`. */
export type ChoiceElement = Occurrence &
  Readonly<{
    type: "choice";
    /**
     * The alternatives, in the standard's order. Each occurrence of the choice
     * matches exactly one. At least one alternative; every alternative MUST
     * match at least one segment.
     */
    alternatives: readonly EventSchemaElement[];
  }>;

// ---------------------------------------------------------------------------
// Runner result
// ---------------------------------------------------------------------------

/**
 * One node of a match: the index of a segment in the matched input, or a
 * group occurrence.
 */
export type SegmentMatch = number | GroupMatch;

/** What `runner()` returns, discriminated by `type`. */
export type RunnerResult = RunnerMatched | RunnerMismatched | RunnerIncomplete;

/** The segments fit the schema. */
export type RunnerMatched = Readonly<{
  type: "matched";
  /** The segment indexes and group occurrences, in input order. */
  groups: readonly SegmentMatch[];
}>;

/** A segment the schema does not allow at its position. */
export type RunnerMismatched = Readonly<{
  type: "mismatched";
  /** The index in the input of the first segment that does not fit. */
  index: number;
  /** The segment IDs valid at that position, sorted. */
  expected: readonly string[];
}>;

/** Every segment fits, but the schema requires more. */
export type RunnerIncomplete = Readonly<{
  type: "incomplete";
  /** The segment IDs valid after the last segment, sorted. */
  expected: readonly string[];
}>;

/** One occurrence of a group in a match. Holds at least one segment. */
export type GroupMatch = Readonly<{
  /** The group name, such as `PATIENT_RESULT`. */
  name: string;
  /** The segment indexes and nested group occurrences, in input order. */
  children: readonly SegmentMatch[];
}>;

// ---------------------------------------------------------------------------
// Load options
// ---------------------------------------------------------------------------

/** Options for event profile loading. */
export type EventLoadOptions = Readonly<{
  /**
   * Whether to resolve a trigger event, such as `ADT_A04`, to the message
   * schema the event maps give it, such as `ADT_A01`. Default: `true`.
   * When `false`, `id` is loaded as a schema ID.
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
  /**
   * Load an event schema definition. Resolves trigger event aliases by
   * default.
   */
  load(
    version: string,
    id: string,
    options?: EventLoadOptions
  ): Promise<EventSchema>;
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
  /** Event schemas, such as `ORU_R01`, by version and schema ID. */
  events: EventProfileStore;
  /** Segment field metadata (required, repeatable, maxLength, datatype). */
  fields: ProfileStore<FieldDefinition>;
  /** Component schema and constraints for datatypes. */
  datatypes: ProfileStore<DatatypeDefinition>;
  /** HL7-defined and user-defined table value sets. */
  tables: ProfileStore<TableDefinition>;
  /** UTG code systems (cumulative, not versioned by HL7v2 version). */
  codeSystems: CodeSystemStore;
  /** Flush all cached entries across all stores. */
  reset(): void;
}>;
