import type { Root, RootContent } from "@glion/ast";
import type { Plugin } from "unified";

const CARRIAGE_RETURN = "\r";

const terminated = (node: RootContent): RootContent => {
  switch (node.type) {
    case "segment": {
      return { ...node, terminator: CARRIAGE_RETURN };
    }
    case "group": {
      return {
        ...node,
        children: node.children.map(terminated) as typeof node.children,
      };
    }
    case "field":
    case "field-repetition":
    case "component":
    case "subcomponent": {
      return node;
    }
  }
};

/**
 * A copy of `tree` in which every segment, segments inside groups included,
 * ends with the segment terminator HL7v2 requires, a carriage return.
 *
 * `tree` is not changed. The copy holds the same field nodes as `tree`.
 */
export const terminateSegments = (tree: Root): Root => ({
  ...tree,
  children: tree.children.map(terminated),
});

/**
 * Unified transform plugin that ends every segment with the segment
 * terminator HL7v2 requires, a carriage return, whatever line break it was
 * read with.
 *
 * Returns a copy of the tree made by {@link terminateSegments}.
 */
export const hl7v2TransformSegmentTerminator: Plugin<[], Root> = () =>
  terminateSegments;

export default hl7v2TransformSegmentTerminator;
