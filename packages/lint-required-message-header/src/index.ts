import type { Root, Segment } from "@glion/ast";
import { lintRule } from "unified-lint-rule";
import { EXIT, visitParents } from "unist-util-visit-parents";

const REQUIRED =
  "Message header (MSH) segment is required as the first segment";

/**
 * Lint rule that reports a message whose first segment is not the message
 * header (`MSH`), or that has no segments.
 *
 * The first segment is found through any nested groups. Reports at most one
 * message per tree.
 */
const hl7v2LintSegmentRequiredMessageHeader = lintRule<Root>(
  {
    origin: "hl7v2-lint:segment-required-message-header",
    url: "https://github.com/rethinkhealth/hl7v2/tree/main/packages/hl7v2-lint-segment-required-message-header#readme",
  },
  (tree, file) => {
    let first: Segment | undefined;
    visitParents(tree, "segment", (node) => {
      first = node;
      return EXIT;
    });

    if (!first) {
      file.message(`${REQUIRED} — received an empty message instead`, {
        ancestors: [tree],
        place: tree.position,
      });
      return;
    }

    if (first.name === "MSH") {
      return;
    }

    if (first.name === "") {
      file.message(
        `${REQUIRED} — received a segment with an empty Segment ID instead`,
        { ancestors: [first], place: first.position }
      );
      return;
    }

    file.message(`${REQUIRED} — received '${first.name}' instead`, {
      ancestors: [first],
      place: first.position,
    });
  }
);

export default hl7v2LintSegmentRequiredMessageHeader;
