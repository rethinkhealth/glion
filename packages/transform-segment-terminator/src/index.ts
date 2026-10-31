import type { Root } from "@glion/ast";
import { visit } from "@glion/util-visit";
import { SEGMENT_TERMINATOR } from "@glion/utils";
import type { Plugin } from "unified";

/**
 * Unified transform plugin that sets every segment's `terminator`, segments
 * inside groups included, to the segment terminator HL7v2 requires, a
 * carriage return.
 */
export const hl7v2TransformSegmentTerminator: Plugin<[], Root> =
  () => (tree) => {
    visit(tree, "segment", (segment) => {
      segment.terminator = SEGMENT_TERMINATOR;
    });
  };

export default hl7v2TransformSegmentTerminator;
