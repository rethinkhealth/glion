import type { Root } from "@glion/ast";
import pluralize from "pluralize";
import { lintRule } from "unified-lint-rule";
import { SKIP, visitParents } from "unist-util-visit-parents";

const messages = {
  emptySegmentId:
    "The segment has an empty Segment ID; a Segment ID must be exactly 3 characters.",
  segmentIdLength: (segmentId: string) =>
    `The Segment ID \`${segmentId}\` is ${pluralize("character", segmentId.length, true)} long; a Segment ID must be exactly 3 characters.`,
} as const;

/**
 * Hl7v2-lint rule to warn when segment header length is invalid.
 */
const hl7v2LintSegmentHeaderLength = lintRule<Root, undefined>(
  {
    origin: "hl7v2-lint:segment-header-length",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-segment-header-length#readme",
  },
  (tree, file) => {
    visitParents<Root, "segment">(tree, "segment", (node, parents) => {
      if (node.name.length === 3) {
        return SKIP;
      }

      if (node.name === "") {
        const message = file.message(messages.emptySegmentId, {
          ancestors: [...parents, node],
          place: node.position,
        });
        message.actual = "";
        return SKIP;
      }

      const message = file.message(messages.segmentIdLength(node.name), {
        ancestors: [...parents, node],
        place: node.position,
      });
      message.actual = node.name;
    });
  }
);

export default hl7v2LintSegmentHeaderLength;
