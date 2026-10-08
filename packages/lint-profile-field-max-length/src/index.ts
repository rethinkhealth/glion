// oxlint-disable-next-line no-unused-vars -- triggers VFile DataMap augmentation
import type { ProfileContext } from "@glion/annotate-profile-context";
import type { Root } from "@glion/ast";
import { SKIP, visit } from "@glion/util-visit";
import { getLength, isEmptyNode } from "@glion/utils";
import pluralize from "pluralize";
import { lintRule } from "unified-lint-rule";

const messages = {
  tooLong: (field: string, name: string, length: number, maxLength: number) =>
    `Field \`${field}\` (${name}) is ${pluralize("character", length, true)} long; it allows at most ${pluralize("character", maxLength, true)}.`,
} as const;

/**
 * Lint rule that validates field value lengths against HL7v2 profile maxLength.
 *
 * For each field with a defined `maxLength` in the profile, checks that
 * each repetition's content length does not exceed the limit.
 *
 * The length is measured using `getLength()` from `hl7v2-utils`, which
 * recursively sums the string lengths of all subcomponent values.
 * Delimiters are not included in the count.
 *
 * Fields without `maxLength` in the profile and empty fields are skipped.
 * Segments without a known profile (e.g., Z-segments) are silently skipped.
 *
 * @example
 *   ```typescript
 *   unified().use(hl7v2LintFieldMaxLength);
 *   ```;
 */
const hl7v2LintFieldMaxLength = lintRule<Root>(
  {
    origin: "hl7v2-lint:field-max-length",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-field-max-length#readme",
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
        if (isEmptyNode(fieldNode)) {
          return SKIP;
        }

        const profile = fieldDef.bySequence.get(info.sequence);

        if (!profile?.maxLength) {
          return SKIP;
        }

        for (const repetition of fieldNode.children) {
          const len = getLength(repetition);
          if (len === 0) {
            continue;
          }

          if (len > profile.maxLength) {
            const message = file.message(
              messages.tooLong(
                `${segment.name}-${info.sequence}`,
                profile.name,
                len,
                profile.maxLength
              ),
              {
                ancestors: [
                  ...segmentAncestors,
                  segment,
                  fieldNode,
                  repetition,
                ],
                place: repetition.position ?? fieldNode.position,
              }
            );
            message.actual = String(len);
          }
        }

        return SKIP;
      });

      return SKIP;
    });
  }
);

export default hl7v2LintFieldMaxLength;
