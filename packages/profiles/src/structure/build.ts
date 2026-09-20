import type {
  ChoiceElement,
  GroupElement,
  SegmentElement,
  StructureElement,
} from "./types";

/**
 * How often an element occurs. Both default to `false`: required, once.
 */
export type OccurrenceOptions = Readonly<{
  /** The standard's `[ ]`. */
  optional?: boolean;
  /** The standard's `{ }`. */
  repeating?: boolean;
}>;

/** A segment element, such as `segment("PID")`. */
export const segment = (
  name: string,
  occurrence: OccurrenceOptions = {}
): SegmentElement => ({
  name,
  optional: occurrence.optional ?? false,
  repeating: occurrence.repeating ?? false,
  type: "segment",
});

/** A segment group element holding `elements`, in order. */
export const group = (
  name: string,
  elements: readonly StructureElement[],
  occurrence: OccurrenceOptions = {}
): GroupElement => ({
  elements,
  name,
  optional: occurrence.optional ?? false,
  repeating: occurrence.repeating ?? false,
  type: "group",
});

/** A choice element: exactly one of `alternatives` per occurrence. */
export const choice = (
  alternatives: readonly StructureElement[],
  occurrence: OccurrenceOptions = {}
): ChoiceElement => ({
  alternatives,
  optional: occurrence.optional ?? false,
  repeating: occurrence.repeating ?? false,
  type: "choice",
});
