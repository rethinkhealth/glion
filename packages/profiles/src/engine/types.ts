/**
 * The public types: event schemas and what `runner()` returns.
 *
 * @module
 */

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
    /**
     * The segment ID, such as `PID`. `Hxx` stands for any segment, and
     * `anyZSegment` for any segment ID that starts with `Z`.
     */
    name: string;
  }>;

/** A segment group, such as `PATIENT_RESULT`. */
export type GroupElement = Occurrence &
  Readonly<{
    type: "group";
    /** The group ID, such as `PATIENT_RESULT`. */
    id: string;
    /**
     * The group name, such as `Patient Result`.
     */
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
// Runner options
// ---------------------------------------------------------------------------

/** Options for `runner()`. */
export type RunnerOptions = Readonly<{
  /**
   * Whether a Z-segment (a segment ID that starts with `Z`) that the schema
   * does not name fits at any position. HL7v2 allows local Z-segments in any
   * message and segment group (v2.5.1 §2.11). When `false`, such a segment is
   * a mismatch, like any segment the schema does not allow. Default: `true`.
   */
  allowZSegments?: boolean;
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
  /**
   * The segment IDs valid at that position, sorted. Empty when the message is
   * complete before that segment.
   */
  expected: readonly string[];
}>;

/** Every segment fits, but the schema requires more. */
export type RunnerIncomplete = Readonly<{
  type: "incomplete";
  /** The segment IDs valid after the last segment, sorted. */
  expected: readonly string[];
}>;

// ---------------------------------------------------------------------------
// Repair result
// ---------------------------------------------------------------------------

/** What `repair()` returns: the fewest edits that make the segments fit. */
export type RepairResult = Readonly<{
  /** The edits, in input order. Empty when the segments fit the schema. */
  edits: readonly RepairEdit[];
  /**
   * The segment indexes and group occurrences of the repaired message, in
   * input order. A missing segment has no index.
   */
  groups: readonly SegmentMatch[];
}>;

/** One edit of a repair, discriminated by `type`. */
export type RepairEdit = RepairMissing | RepairUnexpected;

/** A segment the schema requires and the message does not have. */
export type RepairMissing = Readonly<{
  type: "missing";
  /** The segment ID, as the schema names it, such as `OBR`. */
  segment: string;
  /**
   * The index in the input of the segment it comes before; the input length
   * when it comes at the end.
   */
  index: number;
  /** The IDs of the groups it belongs in, outermost first. */
  path: readonly string[];
}>;

/** A segment the message has and the schema does not allow there. */
export type RepairUnexpected = Readonly<{
  type: "unexpected";
  /** The segment ID, such as `PV1`. */
  segment: string;
  /** The index of the segment in the input. */
  index: number;
  /**
   * The IDs of the groups of the segment before it, outermost first. Empty
   * when that segment is in no group, or when there is none.
   */
  path: readonly string[];
}>;

/** One occurrence of a group in a match. Holds at least one segment. */
export type GroupMatch = Readonly<{
  /** The group ID, such as `PATIENT_RESULT`. */
  id: string;
  /** The group name, such as `Patient Result`. */
  name: string;
  /** The segment indexes and nested group occurrences, in input order. */
  children: readonly SegmentMatch[];
}>;
