import type { Nodes, Segment } from "@glion/ast";
import { lintRule } from "unified-lint-rule";
import { EXIT, visitParents } from "unist-util-visit-parents";

/**
 * Lint rule that reports a message whose first segment is not the message
 * header (`MSH`), or that has no segments.
 *
 * The first segment is found through any nested groups. Reports at most one
 * message per tree.
 */
const hl7v2LintSegmentRequiredMessageHeader = lintRule<Nodes, undefined>(
  {
    origin: "hl7v2-lint:segment-required-message-header",
    url: "https://github.com/rethinkhealth/hl7v2/tree/main/packages/hl7v2-lint-segment-required-message-header#readme",
  },
  (tree, file) => {
    if (tree.type !== "root") {
      return;
    }

    let first: Segment | undefined;
    visitParents(tree, "segment", (node) => {
      first = node;
      return EXIT;
    });

    if (!first) {
      file.message(
        "Message header (MSH) segment is required as the first segment — received an empty message instead",
        { ancestors: [tree], place: tree.position }
      );
      return;
    }

    if (first.name !== "MSH") {
      const received =
        first.name === ""
          ? "a segment with an empty Segment ID"
          : `'${first.name}'`;
      file.message(
        `Message header (MSH) segment is required as the first segment — received ${received} instead`,
        { ancestors: [first], place: first.position }
      );
    }
  }
);
export default hl7v2LintSegmentRequiredMessageHeader;
