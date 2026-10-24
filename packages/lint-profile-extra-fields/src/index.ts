// oxlint-disable-next-line no-unused-vars -- triggers VFile DataMap augmentation
import type { ProfileContext } from "@glion/annotate-profile-context";
import type { Root } from "@glion/ast";
import { SKIP, visit } from "@glion/util-visit";
import { isEmptyNode } from "@glion/utils";
import pluralize from "pluralize";
import { lintRule } from "unified-lint-rule";

const messages = {
  tooManyFields: (count: number, max: number) =>
    `The segment has ${pluralize("field", count, true)}; it allows at most ${pluralize("field", max, true)}.`,
} as const;

/** Options for `@glion/lint-profile-extra-fields`. */
export interface ExtraFieldsOptions {
  /**
   * Count every field the segment holds (`true`), or only the fields up to
   * its last field with a value (`false`, the default).
   */
  strict?: boolean;
}

/**
 * Lint rule that reports a segment with more fields than its profile
 * defines. A segment's fields are counted up to its last field with a value,
 * or every field with `strict: true`.
 *
 * Segments without a known profile (e.g., Z-segments) are silently skipped.
 *
 * @example
 *   ```typescript
 *   unified().use(hl7v2LintExtraFields);
 *   ```;
 */
const hl7v2LintExtraFields = lintRule<Root, ExtraFieldsOptions | undefined>(
  {
    origin: "hl7v2-lint:extra-fields",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-extra-fields#readme",
  },
  (tree, file, options) => {
    const ctx = file.data.profile;
    if (!ctx) {
      return;
    }

    visit(tree, "segment", (segment, segmentAncestors) => {
      const fields = ctx.fields.get(segment.name);
      if (!fields) {
        return SKIP;
      }

      const max = Math.max(0, ...fields.bySequence.keys());
      // Fields `1`, empty, `2`, empty, `^`: `^` holds no value, so it is empty
      // too (HL7v2 Chapter 2). The count runs to the last field with a value,
      // the third, and keeps the empty field before it; `strict` counts all
      // five.
      const count = options?.strict
        ? segment.children.length
        : segment.children.findLastIndex((field) => !isEmptyNode(field)) + 1;
      if (count > max) {
        const message = file.message(messages.tooManyFields(count, max), {
          ancestors: [...segmentAncestors, segment],
          place: segment.position,
        });
        message.actual = String(count);
      }

      return SKIP;
    });
  }
);

export default hl7v2LintExtraFields;
