/**
 * The public types: event schemas and what `runner()` returns, then the
 * profile stores.
 *
 * @module
 */

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

/** The loader of one kind of profile. */
export type ProfileStore<T> = Readonly<{
  /**
   * Loads the profile `id` of `version`. Later loads of the same profile
   * resolve the same value.
   *
   * @throws {Error} When `version` bundles no profile `id`.
   */
  load(version: string, id: string): Promise<T>;
}>;

/** The loader of event schemas. */
export type EventProfileStore = Readonly<{
  /**
   * Loads the event schema of event `id` in `version`, such as `ADT_A04`, or
   * of the schema ID `id`, such as `ADT_A01`. With `{ resolve: false }`, `id`
   * is a schema ID only.
   *
   * @throws {Error} When `version` bundles no event schema for `id`.
   */
  load(
    version: string,
    id: string,
    options?: EventLoadOptions
  ): Promise<EventSchema>;
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

// ---------------------------------------------------------------------------
// Profiles (top-level)
// ---------------------------------------------------------------------------

/** The profile stores. */
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
}>;
