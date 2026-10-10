// oxlint-disable-next-line no-unused-vars -- triggers VFile DataMap augmentation
import type { ProfileContext } from "@glion/annotate-profile-context";
import type { Field, Root, Segment } from "@glion/ast";
import { SKIP, visit } from "@glion/util-visit";
import { isEmptyNode } from "@glion/utils";
import { lintRule } from "unified-lint-rule";

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
  { origin: "hl7v2-lint:extra-components" },
  (tree, file) => {
    const ctx = file.data.profile;
    if (!ctx) {
      return;
    }

    visit(tree, "field", (fieldNode, ancestors, info) => {
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
      if (!dtDef) {
        return SKIP;
      }

      // Primitives allow exactly 1 component (the value itself).
      // Composites: the highest sequence key in the profile is the max
      // component number (keys are 1-based HL7 sequence numbers).
      const maxComponent =
        dtDef.kind === "primitive" ? 1 : maxKey(dtDef.componentsBySequence);

      if (maxComponent === 0) {
        return SKIP;
      }

      for (const repetition of (fieldNode as Field).children) {
        for (let i = maxComponent + 1; i <= repetition.children.length; i++) {
          file.message(
            `Component ${segment.name}-${info.sequence}.${i} is beyond the defined components for ${fieldProfile.datatype} (max: ${maxComponent} in v${ctx.version})`,
            {
              ancestors: [...ancestors, fieldNode, repetition],
              place: repetition.position ?? fieldNode.position,
            }
          );
        }
      }

      return SKIP;
    });
  }
);

/** Return the highest numeric key in a Map, or 0 if empty. */
function maxKey(map: ReadonlyMap<number, unknown>): number {
  let max = 0;
  for (const key of map.keys()) {
    if (key > max) {
      max = key;
    }
  }
  return max;
}

export default hl7v2LintExtraComponents;
