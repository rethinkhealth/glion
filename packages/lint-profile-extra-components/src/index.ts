// oxlint-disable-next-line no-unused-vars -- triggers VFile DataMap augmentation
import type { ProfileContext } from "@glion/annotate-profile-context";
import type { Field, FieldRepetition, Root, Segment } from "@glion/ast";
import { SKIP, visit } from "@glion/util-visit";
import { isEmptyNode } from "@glion/utils";
import pluralize from "pluralize";
import { lintRule } from "unified-lint-rule";

const messages = {
  extraComponent: (
    component: string,
    datatype: string,
    componentCount: number,
    version: string
  ) =>
    `Component \`${component}\` has no definition; \`${datatype}\` defines ${pluralize("component", componentCount, true)} in HL7 v${version}.`,
  primitiveComponent: (component: string, datatype: string, version: string) =>
    `Component \`${component}\` has no definition; \`${datatype}\` is a primitive datatype with no components in HL7 v${version}.`,
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

    visit(tree, "field", (fieldNode, ancestors, info) => {
      if (isEmptyNode(fieldNode as Field)) {
        return SKIP;
      }

      const segment = ancestors.at(-1) as Segment | undefined;
      if (!segment || segment.type !== "segment") {
        return SKIP;
      }

      const fieldProfile = ctx.fields
        .get(segment.name)
        ?.bySequence.get(info.sequence);
      const dtDef = fieldProfile && ctx.datatypes.get(fieldProfile.datatype);
      if (!dtDef) {
        return SKIP;
      }

      const field = `${segment.name}-${info.sequence}`;

      if (dtDef.kind === "primitive") {
        for (const { repetition, sequence } of extraComponents(
          fieldNode as Field,
          1
        )) {
          file.message(
            messages.primitiveComponent(
              `${field}.${sequence}`,
              fieldProfile.datatype,
              ctx.version
            ),
            {
              ancestors: [...ancestors, fieldNode, repetition],
              place: repetition.position ?? fieldNode.position,
            }
          );
        }
        return SKIP;
      }

      // The highest sequence key is the last defined component; keys are
      // 1-based HL7 sequence numbers.
      const componentCount = maxKey(dtDef.componentsBySequence);
      if (componentCount === 0) {
        return SKIP;
      }

      for (const { repetition, sequence } of extraComponents(
        fieldNode as Field,
        componentCount
      )) {
        file.message(
          messages.extraComponent(
            `${field}.${sequence}`,
            fieldProfile.datatype,
            componentCount,
            ctx.version
          ),
          {
            ancestors: [...ancestors, fieldNode, repetition],
            place: repetition.position ?? fieldNode.position,
          }
        );
      }

      return SKIP;
    });
  }
);

/**
 * The components of `field` past the first `componentCount`, in each
 * repetition.
 *
 * @yields The repetition and the 1-based component sequence.
 */
function* extraComponents(
  field: Field,
  componentCount: number
): Generator<{ repetition: FieldRepetition; sequence: number }> {
  for (const repetition of field.children) {
    for (
      let sequence = componentCount + 1;
      sequence <= repetition.children.length;
      sequence++
    ) {
      yield { repetition, sequence };
    }
  }
}

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
