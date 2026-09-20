import type { Root } from "@glion/ast";
import type { StructureProgram } from "@glion/profiles";
import { loadMessageStructure, runner } from "@glion/profiles";
import { EXIT, SKIP, visit } from "@glion/util-visit";
import { lintRule } from "unified-lint-rule";

/**
 * Options for the segment order lint rule.
 */
export interface SegmentOrderOptions {
  /**
   * The message structure to validate against, compiled with
   * `compileStructure`. When provided, the rule does not resolve one from
   * MSH-9.
   */
  program?: StructureProgram;
}

/**
 * Lint rule that validates HL7v2 segment order against message structure
 * profiles.
 *
 * Runs the message structure's program over the segment sequence and verifies
 * each segment appears in the order the structure defines.
 *
 * **Resolution**: If no `program` is provided, the rule resolves the structure
 * from MSH-12 (version) and MSH-9.3 (message structure), or MSH-9.1 and
 * MSH-9.2 when MSH-9.3 is empty. If the structure is unavailable, the rule
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
 *   // With an explicit structure:
 *   const program = compileStructure({
 *     elements: [segment("MSH"), segment("EVN"), segment("PID")],
 *     id: "ADT_SITE",
 *   });
 *   unified().use(hl7v2LintSegmentOrder, { program });
 *   ```;
 */
const hl7v2LintSegmentOrder = lintRule<Root, SegmentOrderOptions>(
  {
    origin: "hl7v2-lint:segment-order",
  },
  async (tree, file, options) => {
    const definition = options?.program
      ? undefined
      : await loadMessageStructure(tree);
    const program = options?.program ?? definition?.program;

    if (!program) {
      return;
    }

    const automaton = runner(program);

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
