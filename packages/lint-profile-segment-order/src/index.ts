import type { Nodes, Root, Segment } from "@glion/ast";
import type { EventSchema } from "@glion/profiles";
import { profiles, runner } from "@glion/profiles";
import { value } from "@glion/util-query";
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
   * When the function returns `undefined`, the rule uses the schema MSH-9
   * names. Return the same object for every message that uses a schema: a
   * new object is compiled on its first run.
   */
  definition?:
    | EventSchema
    | ((
        context: SegmentOrderContext
      ) => EventSchema | undefined | Promise<EventSchema | undefined>);
  /**
   * Whether a Z-segment (a segment ID that starts with `Z`) that the event
   * schema does not name fits at any position. HL7v2 allows local Z-segments
   * in any message and segment group (v2.5.1 §2.11). When `false`, the rule
   * reports such a segment as unexpected. Default: `true`.
   */
  allowZSegments?: boolean;
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
 * the schema does not allow. A Z-segment the schema does not name is allowed
 * anywhere unless `allowZSegments` is `false`.
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
 *   // With a schema chosen per message, and the one MSH-9 names otherwise:
 *   unified().use(hl7v2LintSegmentOrder, {
 *     definition: ({ tree }) =>
 *       isSiteMessage(tree) ? SITE_STRUCTURE : undefined,
 *   });
 *   ```;
 */
/**
 * The event schema MSH-12 and MSH-9 name: MSH-9.3, or MSH-9.1 and MSH-9.2,
 * which the events store resolves through the version's event map.
 */
const schemaOf = async (tree: Root): Promise<EventSchema | undefined> => {
  const version = value(tree, "MSH-12.1")?.value;
  if (!version) {
    return;
  }
  const id =
    value(tree, "MSH-9.3")?.value ||
    `${value(tree, "MSH-9.1")?.value ?? ""}_${value(tree, "MSH-9.2")?.value ?? ""}`;
  return await profiles.events.load(version, id);
};

const hl7v2LintSegmentOrder = lintRule<Root, SegmentOrderOptions>(
  {
    origin: "hl7v2-lint:segment-order",
  },
  async (tree, file, options) => {
    const definition = options?.definition;
    const chosen =
      typeof definition === "function"
        ? await definition({ file, tree })
        : definition;
    const schema = chosen ?? (await schemaOf(tree));

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
      segments.map(({ node }) => node.name),
      { allowZSegments: options?.allowZSegments }
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
