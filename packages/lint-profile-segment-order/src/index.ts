import type { Nodes, Root, Segment } from "@glion/ast";
import type { EventSchema } from "@glion/profiles";
import { loadEventSchema, runner } from "@glion/profiles";
import { SKIP, visit } from "@glion/util-visit";
import { lintRule } from "unified-lint-rule";
import type { VFile } from "vfile";

/** The message a `definition` function chooses an event schema for. */
export interface SegmentOrderContext {
  tree: Root;
  file: VFile;
}

/**
 * Options for the segment order lint rule.
 */
export interface SegmentOrderOptions {
  /**
   * The event schema to validate against, or a function that returns the
   * one to use for a message. Default: the schema MSH-9 names.
   *
   * When the function returns `undefined`, the rule reports nothing for that
   * message.
   */
  definition?:
    | EventSchema
    | ((
        context: SegmentOrderContext
      ) => EventSchema | undefined | Promise<EventSchema | undefined>);
}

/**
 * Lint rule that validates HL7v2 segment order against event schema
 * profiles.
 *
 * Verifies each segment appears in the order the event schema defines.
 *
 * **Resolution**: If no `definition` is provided, the rule resolves the
 * schema from MSH-12 (version) and MSH-9.3 (event schema), or MSH-9.1
 * and MSH-9.2 when MSH-9.3 is empty. If the schema is unavailable, the rule
 * reports nothing.
 *
 * **Behavior**: Reports at most one order error per message: the first segment
 * the schema does not allow.
 *
 * @example
 *   ```typescript
 *   // With the schema MSH-9 names:
 *   unified().use(hl7v2LintSegmentOrder);
 *
 *   // With a schema of your own:
 *   unified().use(hl7v2LintSegmentOrder, {
 *     definition: {
 *       elements: [
 *         { name: "MSH", optional: false, repeating: false, type: "segment" },
 *         { name: "PID", optional: false, repeating: false, type: "segment" },
 *       ],
 *       id: "ADT_SITE",
 *     },
 *   });
 *
 *   // With a schema chosen per message:
 *   unified().use(hl7v2LintSegmentOrder, {
 *     definition: ({ tree }) =>
 *       isSiteMessage(tree) ? SITE_STRUCTURE : loadEventSchema(tree),
 *   });
 *   ```;
 */
const hl7v2LintSegmentOrder = lintRule<Root, SegmentOrderOptions>(
  {
    origin: "hl7v2-lint:segment-order",
  },
  async (tree, file, options) => {
    const definition = options?.definition;
    const schema =
      typeof definition === "function"
        ? await definition({ file, tree })
        : (definition ?? (await loadEventSchema(tree)));

    if (!schema) {
      return;
    }

    const segments: { node: Segment; ancestors: Nodes[] }[] = [];
    visit(tree, "segment", (node, parents) => {
      segments.push({ ancestors: [...parents, node], node });
      return SKIP;
    });

    const result = runner(
      schema,
      segments.map(({ node }) => node.name)
    );

    switch (result.type) {
      case "matched": {
        break;
      }
      case "mismatched": {
        const { ancestors, node } = segments[
          result.index
        ] as (typeof segments)[number];
        file.message(
          `Unexpected segment '${node.name}'. Expected: ${result.expected.join(", ")}`,
          { ancestors, place: node.position }
        );
        break;
      }
      case "incomplete": {
        file.message(
          `Message ended prematurely. Expected: ${result.expected.join(", ")}`,
          { ancestors: [tree], place: tree.position }
        );
        break;
      }
    }
  }
);

export default hl7v2LintSegmentOrder;
