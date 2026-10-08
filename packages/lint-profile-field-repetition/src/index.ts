// oxlint-disable-next-line no-unused-vars -- triggers VFile DataMap augmentation
import type { ProfileContext } from "@glion/annotate-profile-context";
import type { Root } from "@glion/ast";
import { SKIP, visit } from "@glion/util-visit";
import { lintRule } from "unified-lint-rule";

const messages = {
  notRepeatable: (field: string, name: string, repetitionCount: number) =>
    `Field \`${field}\` (${name}) has ${repetitionCount} repetitions; it is not repeatable.`,
} as const;

/**
 * Lint rule that flags fields with multiple repetitions when the profile
 * declares `repeatable: false`.
 *
 * A field with a single repetition is always valid regardless of the
 * `repeatable` flag. Only fields with 2+ repetitions on a non-repeatable
 * field are reported.
 *
 * Segments without a known profile (e.g., Z-segments) are silently skipped.
 *
 * @example
 *   ```typescript
 *   unified().use(hl7v2LintFieldRepetition);
 *   ```;
 */
const hl7v2LintFieldRepetition = lintRule<Root>(
  {
    origin: "hl7v2-lint:field-repetition",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-field-repetition#readme",
  },
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

        if (!profile || profile.repeatable) {
          return SKIP;
        }

        const count = fieldNode.children.length;
        if (count > 1) {
          const message = file.message(
            messages.notRepeatable(
              `${segment.name}-${info.sequence}`,
              profile.name,
              count
            ),
            {
              ancestors: [...segmentAncestors, segment, fieldNode],
              place: fieldNode.position,
            }
          );
          message.actual = String(count);
        }

        return SKIP;
      });

      return SKIP;
    });
  }
);

export default hl7v2LintFieldRepetition;
