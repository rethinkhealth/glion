import type { Node, Segment } from "@glion/ast";
import { isEmptyNode } from "@glion/utils";
import pluralize from "pluralize";
import { lintRule } from "unified-lint-rule";
import { SKIP, visitParents } from "unist-util-visit-parents";

const messages = {
  trailingFieldSeparators: (separatorCount: number) =>
    `The segment has ${pluralize("trailing field separator", separatorCount, true)}.`,
} as const;

const notes = {
  trailingFieldSeparators:
    "HL7v2 does not require field separators after the last field with a value.",
} as const;

/** Options for `@glion/lint-no-trailing-empty-field`. */
export interface NoTrailingEmptyFieldOptions {
  /**
   * Report a segment that ends with one empty field, such as `PID|1|`
   * (`true`), or only a segment that ends with two or more (`false`, the
   * default).
   */
  strict?: boolean;
}

const hl7v2LintNoTrailingEmptyField = lintRule<
  Node,
  NoTrailingEmptyFieldOptions | undefined
>(
  {
    origin: "hl7v2-lint:no-trailing-empty-field",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-no-trailing-empty-field#readme",
  },
  (tree, file, options) => {
    visitParents(tree, "segment", (segment: Segment, ancestors) => {
      // Fields `1`, `^`, empty, empty: `^` holds no value, so it is empty too
      // (HL7v2 Chapter 2). The last field with a value is the first, and the
      // three after it trail. When no field holds a value, the index is -1
      // and every field trails.
      const lastNonEmptyIndex = segment.children.findLastIndex(
        (field) => !isEmptyNode(field)
      );
      const trailing = segment.children.slice(lastNonEmptyIndex + 1);
      const [first] = trailing;
      // The segment ends at a field with a value.
      if (first === undefined) {
        return SKIP;
      }
      // Without `strict`, one empty field at the end is allowed.
      if (!options?.strict && trailing.length === 1) {
        return SKIP;
      }

      const start = first.position?.start;
      const end = segment.position?.end;
      const message = file.message(
        messages.trailingFieldSeparators(trailing.length),
        {
          ancestors: [...ancestors, segment],
          place: start && end ? { end, start } : undefined,
        }
      );
      message.note = notes.trailingFieldSeparators;
    });
  }
);

export default hl7v2LintNoTrailingEmptyField;
