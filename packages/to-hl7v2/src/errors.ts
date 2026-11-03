import type { Component, Field, FieldRepetition, Segment } from "@glion/ast";

/**
 * A segment with no segment terminator, followed by another segment: written
 * as they are, the two would be one segment.
 */
export class SegmentTerminatorError extends Error {
  override readonly name = "SegmentTerminatorError";
  /** The segment with no segment terminator. */
  readonly segment: Segment;

  constructor(segment: Segment) {
    super(
      "A segment that another segment follows has no segment terminator; HL7v2 ends every segment with a carriage return. Set the segment's `terminator`, or apply `@glion/transform-segment-terminator`."
    );
    this.segment = segment;
  }
}

/** A separator the message declares no character for. */
export type Separator = "component" | "repetition" | "subcomponent";

const missingSeparatorMessages = {
  component:
    "A field repetition holds more than one component, and the message declares no component separator. MSH-2 declares the component separator as its first encoding character.",
  repetition:
    "A field holds more than one field repetition, and the message declares no repetition separator. MSH-2 declares the repetition separator as its second encoding character.",
  subcomponent:
    "A component holds more than one subcomponent, and the message declares no subcomponent separator. MSH-2 declares the subcomponent separator as its fourth encoding character.",
} as const satisfies Record<Separator, string>;

/**
 * A node with more than one child, written with delimiters that have no
 * separator to write them apart.
 */
export class MissingSeparatorError extends Error {
  override readonly name = "MissingSeparatorError";
  /** The separator the delimiters have no character for. */
  readonly separator: Separator;
  /** The node whose children cannot be written apart. */
  readonly node: Field | FieldRepetition | Component;

  constructor(separator: Separator, node: Field | FieldRepetition | Component) {
    super(missingSeparatorMessages[separator]);
    this.separator = separator;
    this.node = node;
  }
}
