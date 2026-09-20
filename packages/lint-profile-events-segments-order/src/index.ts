import type { Root } from "@glion/ast";
import type { MessageStructure } from "@glion/profiles";
import { loadMessageStructure, runner } from "@glion/profiles";
import { EXIT, SKIP, visit } from "@glion/util-visit";
import { lintRule } from "unified-lint-rule";
import type { VFile } from "vfile";

/** The message a `definition` function chooses a message structure for. */
export interface SegmentOrderContext {
  tree: Root;
  file: VFile;
}

/**
 * Options for the segment order lint rule.
 */
export interface SegmentOrderOptions {
  /**
   * The message structure to validate against, or a function that returns the
   * one to use for a message. Default: the structure MSH-9 names.
   *
   * When the function returns `undefined`, the rule reports nothing for that
   * message.
   */
  definition?:
    | MessageStructure
    | ((
        context: SegmentOrderContext
      ) =>
        | MessageStructure
        | undefined
        | Promise<MessageStructure | undefined>);
}

/**
 * Lint rule that validates HL7v2 segment order against message structure
 * profiles.
 *
 * Verifies each segment appears in the order the message structure defines.
 *
 * **Resolution**: If no `definition` is provided, the rule resolves the
 * structure from MSH-12 (version) and MSH-9.3 (message structure), or MSH-9.1
 * and MSH-9.2 when MSH-9.3 is empty. If the structure is unavailable, the rule
 * reports nothing.
 *
 * **Behavior**: Reports at most one order error per message: the first segment
 * the structure does not allow.
 *
 * @example
 *   ```typescript
 *   // With the structure MSH-9 names:
 *   unified().use(hl7v2LintSegmentOrder);
 *
 *   // With a structure of your own:
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
 *   // With a structure chosen per message:
 *   unified().use(hl7v2LintSegmentOrder, {
 *     definition: ({ tree }) =>
 *       isSiteMessage(tree) ? SITE_STRUCTURE : loadMessageStructure(tree),
 *   });
 *   ```;
 */
const hl7v2LintSegmentOrder = lintRule<Root, SegmentOrderOptions>(
  {
    origin: "hl7v2-lint:segment-order",
  },
  async (tree, file, options) => {
    const definition = options?.definition;
    const structure =
      typeof definition === "function"
        ? await definition({ file, tree })
        : (definition ?? (await loadMessageStructure(tree)));

    if (!structure) {
      return;
    }

    const automaton = runner(structure);

    // A message with an order error is not also reported as ended early.
    let aborted = false;

    visit(tree, "segment", (node, parents) => {
      const symbol = node.name;

      if (!symbol) {
        aborted = true;
        file.message("Segment has empty segment name at this position", {
          ancestors: [...parents, node],
          place: node.position,
        });
        return EXIT;
      }

      const result = automaton.consume(symbol);

      if (result.type === "invalid") {
        aborted = true;
        file.message(
          `Unexpected segment '${symbol}'. Expected: ${result.expected.join(", ")}`,
          { ancestors: [...parents, node], place: node.position }
        );
        return EXIT;
      }

      return SKIP;
    });

    if (!aborted && !automaton.accepted) {
      file.message(
        `Message ended prematurely. Expected: ${automaton.expected.join(", ")}`,
        { ancestors: [tree], place: tree.position }
      );
    }
  }
);

export default hl7v2LintSegmentOrder;
