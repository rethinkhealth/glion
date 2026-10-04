/**
 * The public types of message structures, in three parts:
 *
 * - **Message structure**: a structure as the HL7v2 standard defines it, such as
 *   `ORU_R01`. A tree of elements: segments, groups of elements, and choices
 *   between elements. Plain data; `message-structure.schema.json` describes the
 *   same shape.
 * - **Match**: what `matchStructure()` returns, the segment indexes of a message
 *   nested in the groups the structure defines.
 * - **Runner**: what `runner()` returns, and the event each `consume()` returns.
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
// Match
// ---------------------------------------------------------------------------

/**
 * One node of a match: the index of a segment in the matched input, or a
 * group occurrence.
 */
export type StructureMatch = number | GroupMatch;

/** One occurrence of a group in a match. Holds at least one segment. */
export type GroupMatch = Readonly<{
  /** The group name, such as `PATIENT_RESULT`. */
  name: string;
  /** The segment indexes and nested group occurrences, in input order. */
  children: readonly StructureMatch[];
}>;

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * A runner over one message structure, fed one segment ID at a time.
 *
 * After the first `invalid` event the runner is failed: every later
 * `consume()` returns `invalid` with an empty `expected`, and `accepted` is
 * `false`.
 */
export type Runner = Readonly<{
  /**
   * Consumes one segment and returns the resulting event.
   *
   * @param segment - The segment ID, such as `PID`.
   */
  consume(segment: string): RunnerEvent;
  /** Whether the segments consumed so far form a complete message. */
  readonly accepted: boolean;
  /**
   * The segment IDs valid next, sorted. After a failure, the IDs that were
   * valid before the rejected segment.
   */
  readonly expected: readonly string[];
}>;

/** The event `consume()` returns, discriminated by `type`. */
export type RunnerEvent = RunnerStepEvent | RunnerInvalidEvent;

/** Returned when the runner accepts a segment. */
export type RunnerStepEvent = Readonly<{
  type: "step";
}>;

/** Returned when the runner rejects a segment. */
export type RunnerInvalidEvent = Readonly<{
  type: "invalid";
  /** The segment ID rejected, such as `PID`. */
  segment: string;
  /** The segment IDs valid at this point, sorted. */
  expected: readonly string[];
}>;
