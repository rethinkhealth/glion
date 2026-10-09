import type { Node } from "@glion/ast";
import pluralize from "pluralize";
import { lintRule } from "unified-lint-rule";
import { SKIP, visit } from "unist-util-visit";

export interface MaxMessageSizeOptions {
  /**
   * Max allowed size of the HL7v2 message in bytes (UTF-8). Default: 1_000_000
   * (1MB).
   */
  maxBytes?: number;
  /**
   * Max allowed number of segments (counts nodes with `type: "segment"`).
   * Default: undefined (disabled). Set to a number to enable.
   */
  maxSegments?: number;
}

const messages = {
  tooManyBytes: (byteLength: number, maxBytes: number) =>
    `The message is ${pluralize("byte", byteLength, true)}; the configured limit is ${pluralize("byte", maxBytes, true)}. Shorten the message or raise \`maxBytes\`.`,
  tooManySegments: (segmentCount: number, maxSegments: number) =>
    `The message has ${pluralize("segment", segmentCount, true)}; the configured limit is ${pluralize("segment", maxSegments, true)}. Remove segments or raise \`maxSegments\`.`,
} as const;

const defaultOptions: Required<Omit<MaxMessageSizeOptions, "maxSegments">> & {
  maxSegments?: number;
} = {
  maxBytes: 10_000_000, // 10MB
  maxSegments: undefined,
};

/**
 * Hl7v2-lint rule to warn when message size exceeds the maximum allowed size.
 *
 * This rule is useful for ensuring that HL7v2 messages do not exceed a safe
 * or expected size limit (default: 10MB).
 */
const hl7v2LintMaxMessageSize = lintRule<Node, MaxMessageSizeOptions>(
  {
    origin: "hl7v2-lint:max-message-size",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-max-message-size#readme",
  },
  (tree, file, opts) => {
    const options = { ...defaultOptions, ...opts };

    // Byte length of the message
    const byteLength = Buffer.byteLength(String(file.value), "utf8");
    if (byteLength > options.maxBytes) {
      const message = file.message(
        messages.tooManyBytes(byteLength, options.maxBytes)
      );
      message.actual = String(byteLength);
    }

    let totalSegments = 0;

    visit(tree, (node) => {
      // Count all segments including those in nested groups
      if (node.type === "segment") {
        totalSegments += 1;
        return SKIP;
      }
    });

    if (options.maxSegments && totalSegments > options.maxSegments) {
      const message = file.message(
        messages.tooManySegments(totalSegments, options.maxSegments)
      );
      message.actual = String(totalSegments);
    }
  }
);

export default hl7v2LintMaxMessageSize;
