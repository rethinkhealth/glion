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

    visit(tree, "segment", (node, parents) => {
      const fieldDef = ctx.fields.get(node.name);
      if (!fieldDef) {
        return SKIP;
      }

      for (const profile of fieldDef.bySequence.values()) {
        if (!profile.required) {
          continue;
        }

        const field = `${node.name}-${profile.sequence}`;
        const fieldNode = node.children[profile.sequence - 1];

        if (!fieldNode) {
          file.message(messages.absentField(field, profile.name), {
            ancestors: [...parents, node],
            place: node.position,
          });
          continue;
        }

        if (isEmptyNode(fieldNode)) {
          const message = file.message(
            messages.emptyField(field, profile.name),
            {
              ancestors: [...parents, node, fieldNode],
              place: fieldNode.position,
            }
          );
          message.actual = "";
        }
      }

      return SKIP;
    });
  }
);

export default hl7v2LintRequiredFields;
