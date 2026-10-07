import type { Root, Segment } from "@glion/ast";
import { lintRule } from "unified-lint-rule";
import { EXIT, visitParents } from "unist-util-visit-parents";

const messages = {
  emptyMessage:
    "The message has no segments; it must start with the message header segment (`MSH`).",
  emptySegmentId:
    "The first segment has an empty Segment ID; a message must start with the message header segment (`MSH`).",
  notMessageHeader: (segmentId: string) =>
    `The first segment is \`${segmentId}\`; a message must start with the message header segment (\`MSH\`).`,
} as const;

/**
 * Lint rule that reports a message whose first segment is not the message
 * header (`MSH`), or that has no segments.
 *
 * The first segment is found through any nested groups. Reports at most one
 * message per tree, with `expected` set to `MSH` and `actual` to the first
 * segment's Segment ID when there is one.
 */
const hl7v2LintSegmentRequiredMessageHeader = lintRule<Root>(
  {
    origin: "hl7v2-lint:segment-required-message-header",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-required-message-header#readme",
  },
  (tree, file) => {
    let first: Segment | undefined;
    visitParents(tree, "segment", (node) => {
      first = node;
      return EXIT;
    });

    if (!first) {
      const message = file.message(messages.emptyMessage, {
        ancestors: [tree],
        place: tree.position,
      });
      message.expected = ["MSH"];
      return;
    }

    if (first.name === "MSH") {
      return;
    }

    if (first.name === "") {
      const message = file.message(messages.emptySegmentId, {
        ancestors: [first],
        place: first.position,
      });
      message.actual = "";
      message.expected = ["MSH"];
      return;
    }

    const message = file.message(messages.notMessageHeader(first.name), {
      ancestors: [first],
      place: first.position,
    });
    message.actual = first.name;
    message.expected = ["MSH"];
  }
);

export default hl7v2LintSegmentRequiredMessageHeader;
