// oxlint-disable-next-line no-unused-vars -- triggers VFile DataMap augmentation
import type { ProfileContext } from "@glion/annotate-profile-context";
import type { Field, FieldRepetition, Nodes, Root, Segment } from "@glion/ast";
import type { DatatypeDefinition } from "@glion/profiles";
import { SKIP, visit } from "@glion/util-visit";
import { isEmptyNode } from "@glion/utils";
import { lintRule } from "unified-lint-rule";
import type { VFile } from "vfile";

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

    visit(tree, "field", (fieldNode, ancestors, info) => {
      // Check emptiness first — most fields in a message are empty,
      // so this avoids segment/profile lookups for the majority of fields
      if (isEmptyNode(fieldNode as Field)) {
        return SKIP;
      }

      const segment = ancestors.at(-1) as Segment | undefined;
      if (!segment || segment.type !== "segment") {
        return SKIP;
      }

      const fieldDef = ctx.fields.get(segment.name);
      if (!fieldDef) {
        return SKIP;
      }

      const fieldProfile = fieldDef.bySequence.get(info.sequence);
      if (!fieldProfile) {
        return SKIP;
      }

      const dtDef = ctx.datatypes.get(fieldProfile.datatype);
      if (
        !dtDef ||
        dtDef.kind !== "composite" ||
        dtDef.requiredSequences.size === 0
      ) {
        return SKIP;
      }

      for (const repetition of (fieldNode as Field).children) {
        checkRepetition(
          file,
          dtDef,
          repetition,
          segment,
          info.sequence,
          ancestors,
          fieldNode as Field
        );
      }

      return SKIP;
    });
  }
);

/** Check a single field repetition for missing required components. */
function checkRepetition(
  file: VFile,
  dtDef: DatatypeDefinition,
  repetition: FieldRepetition,
  segment: Segment,
  sequence: number,
  ancestors: Nodes[],
  fieldNode: Field
): void {
  for (const profile of dtDef.componentsBySequence.values()) {
    if (!profile.required) {
      continue;
    }

    const name = `${segment.name}-${sequence}.${profile.sequence}`;
    const component = repetition.children[profile.sequence - 1];

    if (!component) {
      file.message(messages.absentComponent(name, profile.name), {
        ancestors: [...ancestors, fieldNode, repetition],
        place: repetition.position ?? fieldNode.position,
      });
      continue;
    }

    const value = component.children[0]?.value;
    if (value === undefined || value.length === 0) {
      const message = file.message(
        messages.emptyComponent(name, profile.name),
        {
          ancestors: [...ancestors, fieldNode, repetition, component],
          place:
            component.position ?? repetition.position ?? fieldNode.position,
        }
      );
      message.actual = "";
    }
  }
}

export default hl7v2LintRequiredComponents;
