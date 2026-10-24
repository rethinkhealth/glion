import type { Root } from "@glion/ast";
import { visit } from "@glion/util-visit";
import { isEmptyNode } from "@glion/utils";
import type { Plugin } from "unified";

/** Options for {@link hl7v2TransformTrimTrailingFields}. */
export interface TransformTrimTrailingFieldsOptions {
  /**
   * Keep one empty field at the end of a segment that ends with empty fields,
   * so `PID|1|DOE||` becomes `PID|1|DOE|` (`true`), or remove them all
   * (`false`, the default). A segment that ends with a field with a value is
   * left as it is either way.
   */
  keepTrailingField?: boolean;
}

/**
 * Unified transform plugin that removes the empty fields at the end of each
 * segment.
 *
 * A field is empty when none of its components, repetitions, or
 * subcomponents holds a value (HL7v2 §2.6.1), so `PID|1|DOE|^|` becomes
 * `PID|1|DOE`. A field that holds the HL7v2 null value `""` is kept, and so
 * is every empty field before the last field that is kept. Segments inside
 * groups are trimmed too.
 */
export const hl7v2TransformTrimTrailingFields: Plugin<
  [TransformTrimTrailingFieldsOptions?],
  Root
> = (options) => (tree) => {
  const kept = options?.keepTrailingField ? 1 : 0;

  visit(tree, "segment", (segment) => {
    const last = segment.children.findLastIndex((field) => !isEmptyNode(field));
    segment.children.splice(last + 1 + kept);
  });
};

export default hl7v2TransformTrimTrailingFields;
