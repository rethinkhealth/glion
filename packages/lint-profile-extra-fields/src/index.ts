// oxlint-disable-next-line no-unused-vars -- triggers VFile DataMap augmentation
import type { ProfileContext } from "@glion/annotate-profile-context";
import type { Root } from "@glion/ast";
import { SKIP, visit } from "@glion/util-visit";
import { lintRule } from "unified-lint-rule";

const messages = {
  undefinedField: (field: string, segmentId: string, version: string) =>
    `Field \`${field}\` is present; segment \`${segmentId}\` in HL7 v${version} does not define it.`,
} as const;

/**
 * Lint rule that warns when a segment contains fields beyond the maximum
 * sequence number defined in its profile.
 *
 * Segments without a known profile (e.g., Z-segments) are silently skipped.
 *
 * @example
 *   ```typescript
 *   unified().use(hl7v2LintExtraFields);
 *   ```;
 */
const hl7v2LintExtraFields = lintRule<Root>(
  {
    origin: "hl7v2-lint:extra-fields",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-extra-fields#readme",
  },
  (tree, file) => {
    const ctx = file.data.profile;
    if (!ctx) {
      return;
    }

    visit(tree, "segment", (segment, segmentAncestors) => {
      const fields = ctx.fields.get(segment.name);
      if (!fields) {
        return SKIP;
      }

      const defined = Math.max(0, ...fields.bySequence.keys());

      visit(segment, "field", (field, _fieldAncestors, { sequence }) => {
        if (sequence > defined) {
          file.message(
            messages.undefinedField(
              `${segment.name}-${sequence}`,
              segment.name,
              ctx.version
            ),
            {
              ancestors: [...segmentAncestors, segment, field],
              place: field.position,
            }
          );
        }

        return SKIP;
      });

      return SKIP;
    });
  }
);

export default hl7v2LintExtraFields;
