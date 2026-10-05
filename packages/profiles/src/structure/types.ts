/**
 * The public types of message structures, in two parts:
 *
 * - **Message structure**: a structure as the HL7v2 standard defines it, such as
 *   `ORU_R01`. A tree of elements: segments, groups of elements, and choices
 *   between elements. Plain data; `message-structure.schema.json` describes the
 *   same shape.
 * - **Runner result**: what `runner()` returns: the segment indexes of a message
 *   nested in the groups the structure defines, or where the message stops
 *   fitting the structure.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Message structure
// ---------------------------------------------------------------------------

/** A message structure, such as `ORU_R01`, as the HL7v2 standard defines it. */
export type MessageStructure = Readonly<{
  /** The JSON Schema the structure conforms to. */
  $schema?: string;
  /** The message structure ID, as carried in MSH-9.3, such as `ORU_R01`. */
  id: string;
  /** The top-level elements, in the standard's order. At least one. */
  elements: readonly StructureElement[];
}>;

/**
 * One element of a message structure, discriminated by `type`: a segment, a
 * group, or a choice.
 */
export type StructureElement = SegmentElement | GroupElement | ChoiceElement;

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
    elements: readonly StructureElement[];
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
    alternatives: readonly StructureElement[];
  }>;

// ---------------------------------------------------------------------------
// Runner result
// ---------------------------------------------------------------------------

/**
 * One node of a match: the index of a segment in the matched input, or a
 * group occurrence.
 */
export type StructureMatch = number | GroupMatch;

/** What `runner()` returns, discriminated by `type`. */
export type RunnerResult = RunnerMatched | RunnerMismatched | RunnerIncomplete;

/** The segments fit the structure. */
export type RunnerMatched = Readonly<{
  type: "matched";
  /** The segment indexes and group occurrences, in input order. */
  groups: readonly StructureMatch[];
}>;

/** A segment the structure does not allow at its position. */
export type RunnerMismatched = Readonly<{
  type: "mismatched";
  /** The index in the input of the first segment that does not fit. */
  index: number;
  /** The segment IDs valid at that position, sorted. */
  expected: readonly string[];
}>;

/** Every segment fits, but the structure requires more. */
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
  children: readonly StructureMatch[];
}>;
