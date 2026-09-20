/** A message structure, such as `ORU_R01`, as the HL7v2 standard defines it. */
export type MessageStructure = Readonly<{
  /** The JSON Schema the structure conforms to. */
  $schema?: string;
  /** The message structure ID, as carried in MSH-9.3. */
  id: string;
  elements: readonly StructureElement[];
}>;

/** One element of a message structure, in the standard's order. */
export type StructureElement = SegmentElement | GroupElement | ChoiceElement;

/**
 * How often an element occurs: `optional` is the standard's `[ ]`, `repeating`
 * its `{ }`.
 */
export type Occurrence = Readonly<{
  optional: boolean;
  repeating: boolean;
}>;

/** A segment, such as `PID`. The name `Hxx` stands for any segment. */
export type SegmentElement = Occurrence &
  Readonly<{
    type: "segment";
    name: string;
  }>;

/** A segment group, such as `PATIENT_RESULT`. */
export type GroupElement = Occurrence &
  Readonly<{
    type: "group";
    name: string;
    elements: readonly StructureElement[];
  }>;

/**
 * A choice, the standard's `< A | B >`: exactly one alternative per
 * occurrence. Every alternative MUST match at least one segment.
 */
export type ChoiceElement = Occurrence &
  Readonly<{
    type: "choice";
    alternatives: readonly StructureElement[];
  }>;

/**
 * A message structure compiled for `runner()` and `matchStructure()`. Plain
 * data: it survives `JSON.stringify`.
 *
 * States are numbered from `0`. A state with a non-null entry in `segments`
 * consumes that segment and moves to the next state number; every other state
 * moves only along its edges, which are listed in priority order.
 */
export type StructureProgram = Readonly<{
  start: number;
  final: number;
  /** Group names, indexed by group number. */
  groups: readonly string[];
  /** The segment each state consumes, or `null`. */
  segments: readonly (string | null)[];
  /** The edges leaving each state, highest priority first. */
  edges: readonly (readonly StructureEdge[])[];
}>;

/**
 * An edge to `target`. `action` is `0` for none, `g + 1` to open group `g`,
 * and `-(g + 1)` to close it.
 */
export type StructureEdge = readonly [target: number, action: number];

/** A group occurrence in a match, holding segment indexes and nested groups. */
export type GroupMatch = Readonly<{
  name: string;
  children: readonly StructureMatch[];
}>;

/** A segment's index in the matched input, or a group occurrence. */
export type StructureMatch = number | GroupMatch;

/**
 * A message structure as `profiles.events.load()` returns it: the structure
 * and its compiled program.
 */
export type MessageStructureDefinition = Readonly<{
  structure: MessageStructure;
  program: StructureProgram;
}>;

/** Emitted when the runner accepts a segment. */
export type RunnerStepEvent = Readonly<{
  type: "step";
}>;

/** Emitted when the runner rejects a segment. */
export type RunnerInvalidEvent = Readonly<{
  type: "invalid";
  /** The segment name rejected, such as `PID`. */
  symbol: string;
  /** The segment names valid at this point, sorted. */
  expected: readonly string[];
}>;

/** The event `consume()` returns, discriminated by `type`. */
export type RunnerEvent = RunnerStepEvent | RunnerInvalidEvent;

/**
 * A runner over one message structure, fed one segment name at a time.
 *
 * After the first `invalid` event the runner is failed: every later
 * `consume()` returns `invalid` with an empty `expected`, and `accepted` is
 * `false`.
 */
export type Runner = Readonly<{
  /**
   * Consumes one segment and returns the resulting event.
   *
   * @param symbol - The segment name, such as `PID`.
   */
  consume(symbol: string): RunnerEvent;
  /** Whether the segments consumed so far form a complete message. */
  readonly accepted: boolean;
  /**
   * The segment names valid next, sorted. After a failure, the names that
   * were valid before the rejected segment.
   */
  readonly expected: readonly string[];
}>;
