// oxlint-disable-next-line no-unused-vars -- triggers VFile DataMap augmentation
import type { ProfileContext } from "@glion/annotate-profile-context";
import type { Root } from "@glion/ast";
import { SKIP, visit } from "@glion/util-visit";
import { isEmptyNode } from "@glion/utils";
import { lintRule } from "unified-lint-rule";

const messages = {
  undefinedComponent: (component: string, datatype: string, version: string) =>
    `Component \`${component}\` is present; datatype \`${datatype}\` in HL7 v${version} does not define it.`,
} as const;

/**
 * Lint rule that warns when a field contains more components than its
 * datatype profile defines.
 *
 * For composite datatypes, checks against the defined component count.
 * For primitive datatypes, the maximum is 1 — any additional components
 * are flagged as extra.
 *
 * Empty fields are skipped.
 * Segments without a known profile (e.g., Z-segments) are silently skipped.
 *
 * @example
 *   ```typescript
 *   unified().use(hl7v2LintExtraComponents);
 *   ```;
 */
const hl7v2LintExtraComponents = lintRule<Root>(
  {
    origin: "hl7v2-lint:extra-components",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-extra-components#readme",
  },
  (tree, file) => {
    const ctx = file.data.profile;
    if (!ctx) {
      return;
    }

    visit(tree, "field", (field, ancestors, { segment, sequence }) => {
      const profile =
        segment && ctx.fields.get(segment.name)?.bySequence.get(sequence);
      const datatype = profile && ctx.datatypes.get(profile.datatype);
      if (!segment || !profile || !datatype || isEmptyNode(field)) {
        return SKIP;
      }

      // A primitive datatype has no component definitions; its value is
      // component 1.
      const defined = Math.max(1, ...datatype.componentsBySequence.keys());

      // Only the components past the defined ones are read: visiting every
      // component to find the rare extra one costs ~10% on lint-profile.
      for (const repetition of field.children) {
        for (const [offset, component] of repetition.children
          .slice(defined)
          .entries()) {
          file.message(
            messages.undefinedComponent(
              `${segment.name}-${sequence}.${defined + offset + 1}`,
              profile.datatype,
              ctx.version
            ),
            {
              ancestors: [...ancestors, field, repetition, component],
              place: component.position,
            }
          );
        }
      }

      return SKIP;
    });
  }
);

export default hl7v2LintExtraComponents;
