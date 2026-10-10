// oxlint-disable-next-line no-unused-vars -- triggers VFile DataMap augmentation
import type { ProfileContext } from "@glion/annotate-profile-context";
import type { Component, FieldRepetition, Root } from "@glion/ast";
import type { ComponentProfile, DatatypeDefinition } from "@glion/profiles";
import { SKIP, visit } from "@glion/util-visit";
import { isEmptyNode } from "@glion/utils";
import { lintRule } from "unified-lint-rule";

const messages = {
  absentComponent: (component: string, name: string) =>
    `Component \`${component}\` (${name}) is not present; it is required.`,
  emptyComponent: (component: string, name: string) =>
    `Component \`${component}\` (${name}) is empty; it is required.`,
} as const;

/**
 * Lint rule that validates required components in composite datatype fields.
 *
 * For each field with a composite datatype, checks that all components
 * marked `required: true` in the datatype definition are present and
 * non-empty in every field repetition.
 *
 * Empty fields are skipped (the required-fields rule handles that).
 * Simple (non-composite) datatypes are skipped.
 * Segments without a known profile (e.g., Z-segments) are silently skipped.
 *
 * @example
 *   ```typescript
 *   unified().use(hl7v2LintRequiredComponents);
 *   ```;
 */
const hl7v2LintRequiredComponents = lintRule<Root>(
  {
    origin: "hl7v2-lint:required-components",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-required-components#readme",
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
      if (!datatype || isEmptyNode(field)) {
        return SKIP;
      }

      for (const repetition of field.children) {
        for (const { component, required } of unmetComponents(
          repetition,
          datatype
        )) {
          const id = `${segment.name}-${sequence}.${required.sequence}`;

          if (!component) {
            file.message(messages.absentComponent(id, required.name), {
              ancestors: [...ancestors, field, repetition],
              place: repetition.position,
            });
            continue;
          }

          const message = file.message(
            messages.emptyComponent(id, required.name),
            {
              ancestors: [...ancestors, field, repetition, component],
              place: component.position,
            }
          );
          message.actual = "";
        }
      }

      return SKIP;
    });
  }
);

/**
 * The required components of `datatype` that `repetition` leaves absent or
 * empty, with the component when it is present.
 *
 * @yields The required component's profile, and the component when present.
 */
function* unmetComponents(
  repetition: FieldRepetition,
  datatype: DatatypeDefinition
): Generator<{ component: Component | undefined; required: ComponentProfile }> {
  for (const required of datatype.componentsBySequence.values()) {
    if (!required.required) {
      continue;
    }

    const component = repetition.children[required.sequence - 1];
    if (!component?.children[0]?.value) {
      yield { component, required };
    }
  }
}

export default hl7v2LintRequiredComponents;
