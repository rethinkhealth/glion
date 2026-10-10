// oxlint-disable-next-line no-unused-vars -- triggers VFile DataMap augmentation
import type { ProfileContext } from "@glion/annotate-profile-context";
import type { Field, FieldRepetition, Nodes, Root, Segment } from "@glion/ast";
import type { DatatypeDefinition } from "@glion/profiles";
import { SKIP, visit } from "@glion/util-visit";
import { isEmptyNode } from "@glion/utils";
import { lintRule } from "unified-lint-rule";
import type { VFile } from "vfile";

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
  { origin: "hl7v2-lint:required-components" },
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
      if (fieldProfile?.datatype === undefined) {
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
  for (const compSeq of dtDef.requiredSequences) {
    const component = repetition.children[compSeq - 1];
    const compHasValue =
      component?.children[0]?.value !== undefined &&
      component.children[0].value.length > 0;

    if (!compHasValue) {
      const compProfile = dtDef.componentsBySequence.get(compSeq);
      const compName = compProfile?.name ? ` (${compProfile.name})` : "";
      file.message(
        `Required component ${segment.name}-${sequence}.${compSeq}${compName} is missing or empty`,
        {
          ancestors: [
            ...ancestors,
            fieldNode,
            repetition,
            ...(component ? [component] : []),
          ],
          place:
            component?.position ?? repetition.position ?? fieldNode.position,
        }
      );
    }
  }
}

export default hl7v2LintRequiredComponents;
