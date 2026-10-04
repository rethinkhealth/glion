/**
 * The compiled form of a message structure, internal to the package.
 *
 * `compileStructure()` builds it; `runner()` and `matchStructure()` run it.
 * See compile.ts for how each element compiles.
 *
 * @module
 */

/**
 * A message structure compiled to a Thompson NFA over segment names, stored
 * as parallel arrays indexed by state number.
 *
 * States are numbered from `0`. A state with a non-null entry in `segments`
 * consumes that segment and moves to state `state + 1`, with no edge stored.
 * Every other state consumes nothing and moves along its `edges`.
 */
export type StructureProgram = Readonly<{
  /** The state a message starts in. */
  start: number;
  /** The state that ends a complete message. It has no edges. */
  final: number;
  /** Group names, such as `PATIENT_RESULT`, indexed by group number. */
  groups: readonly string[];
  /** By state, the segment the state consumes, or `null`. */
  segments: readonly (string | null)[];
  /** By state, the edges leaving it, highest priority first. */
  edges: readonly (readonly StructureEdge[])[];
}>;

/**
 * A move to state `target` that consumes no segment.
 *
 * `boundary` is `0` when the edge crosses no group boundary, `g + 1` when it
 * opens group `g`, and `-(g + 1)` when it closes group `g`, where `g` indexes
 * {@link StructureProgram.groups}.
 */
export type StructureEdge = readonly [target: number, boundary: number];
