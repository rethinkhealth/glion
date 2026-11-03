// oxlint-disable-next-line no-unused-vars -- triggers FieldData augmentation
import type { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import type { Root } from "@glion/ast";
import { SKIP, visit } from "@glion/util-visit";
import { getLength } from "@glion/utils";
import pluralize from "pluralize";
import { lintRule } from "unified-lint-rule";

const messages = {
  tooLong: (length: number, max: number) =>
    `The value is ${pluralize("character", length, true)} long; the field allows at most ${pluralize("character", max, true)}.`,
} as const;

/**
 * Lint rule that reports a field repetition longer than the field's LEN.
 *
 * Reads `maxLength` from `field.data`, so `@glion/annotate-profile-fields`
 * MUST run before it. The length of a repetition is the sum of its values,
 * delimiters excluded.
 *
 * @example
 *   ```typescript
 *   unified()
 *     .use(hl7v2AnnotateProfileContext)
 *     .use(hl7v2AnnotateProfileFields)
 *     .use(hl7v2LintFieldMaxLength);
 *   ```;
 */
const hl7v2LintFieldMaxLength = lintRule<Root>(
  {
    origin: "hl7v2-lint:field-max-length",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-field-max-length#readme",
  },
  (tree, file) => {
    visit(tree, "field", (field, ancestors) => {
      // A field without a LEN has no maximum length.
      const maxLength = field.data?.maxLength ?? Number.POSITIVE_INFINITY;

      // HL7v2 applies LEN to each repetition, not to the whole field.
      for (const repetition of field.children) {
        const length = getLength(repetition);
        if (length > maxLength) {
          const message = file.message(messages.tooLong(length, maxLength), {
            ancestors: [...ancestors, field, repetition],
            place: repetition.position ?? field.position,
          });
          message.actual = String(length);
        }
      }
      return SKIP;
    });
  }
);

export default hl7v2LintFieldMaxLength;
