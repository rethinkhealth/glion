import type { Segment } from "@glion/ast";

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
