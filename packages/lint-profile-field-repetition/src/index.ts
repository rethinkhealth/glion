// oxlint-disable-next-line no-unused-vars -- triggers VFile DataMap augmentation
import type { ProfileContext } from "@glion/annotate-profile-context";
import type { Root } from "@glion/ast";
import { SKIP, visit } from "@glion/util-visit";
import { lintRule } from "unified-lint-rule";

/**
 * Lint rule that flags fields with multiple repetitions when the profile
 * gives the field `repetitions: 1`.
 *
 * A field with a single repetition is always valid.
 *
 * Segments without a known profile (e.g., Z-segments) are silently skipped.
 *
 * @example
 *   ```typescript
 *   unified().use(hl7v2LintFieldRepetition);
 *   ```;
 */
const hl7v2LintFieldRepetition = lintRule<Root>(
  { origin: "hl7v2-lint:field-repetition" },
  (tree, file) => {
    const ctx = file.data.profile;
    if (!ctx) {
      return;
    }

    visit(tree, "segment", (segment, segmentAncestors) => {
      const fieldDef = ctx.fields.get(segment.name);
      if (!fieldDef) {
        return SKIP;
      }

      visit(segment, "field", (fieldNode, _fieldAncestors, info) => {
        const profile = fieldDef.bySequence.get(info.sequence);

        if (!profile || profile.repetitions !== 1) {
          return SKIP;
        }

        const count = fieldNode.children.length;
        if (count > 1) {
          const name = profile.name ? ` (${profile.name})` : "";
          file.message(
            `Field ${segment.name}-${info.sequence}${name} is not repeatable but has ${count} repetitions`,
            {
              ancestors: [...segmentAncestors, segment, fieldNode],
              place: fieldNode.position,
            }
          );
        }

        return SKIP;
      });

      return SKIP;
    });
  }
);

export default hl7v2LintFieldRepetition;
