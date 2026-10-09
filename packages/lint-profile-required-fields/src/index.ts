// oxlint-disable-next-line no-unused-vars -- triggers VFile DataMap augmentation
import type { ProfileContext } from "@glion/annotate-profile-context";
import type { Root } from "@glion/ast";
import { SKIP, visit } from "@glion/util-visit";
import { isEmptyNode } from "@glion/utils";
import { lintRule } from "unified-lint-rule";

const messages = {
  absentField: (field: string, name: string) =>
    `Field \`${field}\` (${name}) is not present; it is required.`,
  emptyField: (field: string, name: string) =>
    `Field \`${field}\` (${name}) is empty; it is required.`,
} as const;

/**
 * Lint rule that validates required fields per HL7v2 profile.
 *
 * For each segment, checks that all fields marked `required: true`
 * in the field definition are present and non-empty.
 *
 * Segments without a known profile (e.g., Z-segments) are silently skipped.
 *
 * Requires `@glion/annotate-profile-context` to run first
 * so that `file.data.fields` is populated.
 *
 * @example
 *   ```typescript
 *   unified().use(hl7v2AnnotateProfileContext).use(hl7v2LintRequiredFields);
 *   ```;
 */
const hl7v2LintRequiredFields = lintRule<Root>(
  {
    origin: "hl7v2-lint:required-fields",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-required-fields#readme",
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

      for (const required of fields.bySequence.values()) {
        if (!required.required) {
          continue;
        }

        const id = `${segment.name}-${required.sequence}`;
        const field = segment.children[required.sequence - 1];

        if (!field) {
          file.message(messages.absentField(id, required.name), {
            ancestors: [...segmentAncestors, segment],
            place: segment.position,
          });
          continue;
        }

        if (isEmptyNode(field)) {
          const message = file.message(messages.emptyField(id, required.name), {
            ancestors: [...segmentAncestors, segment, field],
            place: field.position,
          });
          message.actual = "";
        }
      }

      return SKIP;
    });
  }
);

export default hl7v2LintRequiredFields;
