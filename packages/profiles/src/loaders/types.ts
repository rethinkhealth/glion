// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/** A segment's entry in a bundled `fields.json`. */
export type SegmentFieldsEntry = Readonly<{
  segmentId: string;
  fields: readonly FieldProfile[];
}>;

/** Field validation constraints for a single field within a segment. */
export type FieldProfile = Readonly<{
  sequence: number;
  id: string;
  required: boolean;
  repeatable: boolean;
  datatype: string;
  maxLength?: number;
  table?: string;
  name?: string;
  item?: string;
}>;

/**
 * Compiled field definition for a segment.
 * Returned by `loadFields()`.
 */
export type FieldDefinition = Readonly<{
  segmentId: string;
  /** O(1) lookup of field profile by sequence number. */
  bySequence: ReadonlyMap<number, FieldProfile>;
  /** O(1) check for required field sequences. */
  requiredSequences: ReadonlySet<number>;
}>;

// ---------------------------------------------------------------------------
// Datatypes
// ---------------------------------------------------------------------------

/** A datatype's entry in a bundled `datatypes.json`. */
export type DatatypeEntry = Readonly<{
  id: string;
  version: string;
  kind: string;
  title?: string;
  components: readonly ComponentProfile[];
}>;

/** Component validation constraints within a composite datatype. */
export type ComponentProfile = Readonly<{
  sequence: number;
  name: string;
  datatypeId: string;
  required: boolean;
  maxLength?: number;
}>;

/**
 * Compiled datatype definition.
 * Returned by `loadDatatypes()`.
 */
export type DatatypeDefinition = Readonly<{
  id: string;
  version: string;
  kind: string;
  title?: string;
  /** O(1) lookup of component profile by sequence number. */
  componentsBySequence: ReadonlyMap<number, ComponentProfile>;
  /** O(1) check for required component sequences. */
  requiredSequences: ReadonlySet<number>;
}>;

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** A table's entry in a bundled `tables.json`. */
export type TableEntry = Readonly<{
  id: string;
  description: string;
  type: "user" | "hl7";
  codes: readonly TableCodeEntry[];
}>;

/** A single code entry within a table. */
export type TableCodeEntry = Readonly<{
  name: string;
  description: string;
}>;

/**
 * Compiled table definition.
 * Returned by `loadTables()`.
 */
export type TableDefinition = Readonly<{
  id: string;
  description: string;
  type: "user" | "hl7";
  /** O(1) lookup of code entry by name. */
  codes: ReadonlyMap<string, TableCodeEntry>;
}>;

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

/** Segment metadata from the HL7v2 specification. */
export type SegmentProfile = Readonly<{
  id: string;
  title: string;
}>;

/**
 * Compiled segment definition for a version.
 * Returned by `loadSegments()`.
 */
export type SegmentDefinition = Readonly<{
  /** O(1) lookup of segment profile by segment ID (e.g., "MSH", "PID"). */
  byId: ReadonlyMap<string, SegmentProfile>;
}>;

// ---------------------------------------------------------------------------
// UTG Code Systems
// ---------------------------------------------------------------------------

/** A code system's entry in the bundled `code-systems.json`. */
export type CodeSystemEntry = Readonly<{
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
 * Returned by `loadCodeSystems()`.
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
