import type { Field, Node, Segment } from "@glion/ast";
import { isEmptyNode } from "@glion/utils";
import pluralize from "pluralize";
import { lintRule } from "unified-lint-rule";
import { SKIP, visitParents } from "unist-util-visit-parents";

const messages = {
  emptySegmentIdTrailingEmptyFields: (fieldCount: number) =>
    `A segment with an empty Segment ID ends with ${pluralize("empty field", fieldCount, true)}; a segment should end at its last field with a value.`,
  trailingEmptyFields: (segmentId: string, fieldCount: number) =>
    `Segment \`${segmentId}\` ends with ${pluralize("empty field", fieldCount, true)}; a segment should end at its last field with a value.`,
} as const;

const hl7v2LintNoTrailingEmptyField = lintRule<Node, undefined>(
  {
    origin: "hl7v2-lint:no-trailing-empty-field",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-no-trailing-empty-field#readme",
  },
  (tree, file) => {
    visitParents(tree, "segment", (segment: Segment, ancestors) => {
      const fields = segment.children as Field[];

      // If the segment has no fields, return SKIP
      if (!fields?.length) {
        return SKIP;
      }

      // Find the index of the last non-empty field
      const lastNonEmptyIndex = fields.findLastIndex(
        (field) => !isEmptyNode(field)
      );

      // If the last non-empty field is the last field in the segment, return SKIP
      if (lastNonEmptyIndex === fields.length - 1) {
        return SKIP;
      }

      const trailingCount = fields.length - lastNonEmptyIndex - 1;
      const firstTrailingIndex = lastNonEmptyIndex + 1;

      const start = fields[firstTrailingIndex]?.position?.start;
      const end = fields.at(-1)?.position?.end;

      // Adjust end position by +1 to include the field separator after the last empty field
      const adjustedEnd =
        end && end.offset !== undefined && end.column !== undefined
          ? {
              ...end,
              column: end.column + 1,
              offset: end.offset + 1,
            }
          : undefined;

      const options = {
        ancestors: [...ancestors, segment, ...fields.slice(firstTrailingIndex)],
        place: start && adjustedEnd ? { end: adjustedEnd, start } : undefined,
      };

      if (segment.name === "") {
        file.message(
          messages.emptySegmentIdTrailingEmptyFields(trailingCount),
          options
        );
        return;
      }

      file.message(
        messages.trailingEmptyFields(segment.name, trailingCount),
        options
      );
    });
  }
);

export default hl7v2LintNoTrailingEmptyField;
