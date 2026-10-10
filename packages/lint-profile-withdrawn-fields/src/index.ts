// oxlint-disable-next-line no-unused-vars -- triggers VFile DataMap augmentation
import type { ProfileContext } from "@glion/annotate-profile-context";
import type { Root } from "@glion/ast";
import { SKIP, visit } from "@glion/util-visit";
import { isEmptyNode } from "@glion/utils";
import { lintRule } from "unified-lint-rule";

const messages = {
  withdrawnField: (field: string, version: string) =>
    `Field \`${field}\` has a value; it is withdrawn in v${version} and must be empty.`,
  withdrawnNamedField: (field: string, name: string, version: string) =>
    `Field \`${field}\` (${name}) has a value; it is withdrawn in v${version} and must be empty.`,
} as const;

/**
 * Lint rule that reports a value in a field whose optionality is `W`
 * (withdrawn) in the profile of the message's version.
 *
 * Segments without a known profile (e.g., Z-segments) are skipped.
 *
 * @example
 *   ```typescript
 *   unified().use(hl7v2AnnotateProfileContext).use(hl7v2LintWithdrawnFields);
 *   ```;
 */
const hl7v2LintWithdrawnFields = lintRule<Root>(
  {
    origin: "hl7v2-lint:withdrawn-fields",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-withdrawn-fields#readme",
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
        if (profile?.optionality !== "W" || isEmptyNode(fieldNode)) {
          return SKIP;
        }

        file.message(
          profile.name === undefined
            ? messages.withdrawnField(profile.id, ctx.version)
            : messages.withdrawnNamedField(
                profile.id,
                profile.name,
                ctx.version
              ),
          {
            ancestors: [...segmentAncestors, segment, fieldNode],
            place: fieldNode.position,
          }
        );
        return SKIP;
      });

      return SKIP;
    });
  }
);

export default hl7v2LintWithdrawnFields;
