// oxlint-disable-next-line no-unused-vars -- triggers VFile DataMap augmentation
import type { ProfileContext } from "@glion/annotate-profile-context";
// oxlint-disable-next-line no-unused-vars -- triggers FieldRepetitionData, ComponentData and SubcomponentData augmentation
import type { hl7v2AnnotateProfileDatatypes } from "@glion/annotate-profile-datatypes";
import type {
  Component,
  ComponentData,
  FieldRepetition,
  FieldRepetitionData,
  Root,
  Subcomponent,
  SubcomponentData,
} from "@glion/ast";
import { visit } from "@glion/util-visit";
import type { Plugin } from "unified";
import type { VFile } from "vfile";

/**
 * An entry of an HL7v2 table that a primitive value matches.
 *
 * @example
 *   ```ts
 *   // PID-8 `F` in a v2.5 message, table 0001 (Administrative Sex)
 *   const entry: TableValue = { value: "F", description: "Female" };
 *   ```
 */
export interface TableValue {
  /** The value as written in the message, such as `"F"`. */
  value: string;
  /** The description the table prints for the value, such as `"Female"`. */
  description: string;
}

declare module "@glion/ast" {
  interface FieldRepetitionData {
    /** The entry of `table` this repetition's value matches. */
    tableValue?: TableValue | undefined;
  }
  interface ComponentData {
    /** The entry of `table` this component's value matches. */
    tableValue?: TableValue | undefined;
  }
  interface SubcomponentData {
    /** The entry of `table` this subcomponent's value matches. */
    tableValue?: TableValue | undefined;
  }
}

/**
 * A primitive field repetition, component, or subcomponent bound to a table:
 * its `data.kind` is `"primitive"` and its `data.table` is set.
 */
type CodedPrimitive = (FieldRepetition | Component | Subcomponent) & {
  data: (FieldRepetitionData | ComponentData | SubcomponentData) & {
    table: string;
  };
};

/**
 * The value of a primitive node: its first subcomponent, or `undefined` when
 * the node has none.
 *
 * Components and subcomponents a primitive datatype does not define are
 * ignored, as HL7v2 tells the recipient to ignore "components, subcomponents,
 * and extra repetitions of a field that are present but were not expected".
 */
function primitiveValue(
  node: FieldRepetition | Component | Subcomponent
): string | undefined {
  switch (node.type) {
    case "field-repetition": {
      // A primitive field, such as v2.5 PID-8 (IS): `F^Female` → `F`
      return node.children[0]?.children[0]?.value;
    }
    case "component": {
      // A primitive component, such as XPN.7 (ID): `M`
      return node.children[0]?.value;
    }
    case "subcomponent": {
      // A primitive subcomponent, such as HD.3 (ID) inside XCN.9
      return node.value;
    }
  }
}

/**
 * Unified plugin that annotates each primitive node with a table (a field
 * repetition, component, or subcomponent whose `data.kind` is `"primitive"`
 * and whose `data.table` is set) with the entry of that table its value
 * matches, as `node.data.tableValue`.
 *
 * Reads `kind` and `table` from `node.data`, set by
 * `@glion/annotate-profile-datatypes`, and the tables of the message's HL7v2
 * version from `file.data.profile`, set by `@glion/annotate-profile-context`.
 * Both MUST run before it; without `file.data.profile` the tree is returned
 * unchanged.
 *
 * Composite nodes are not annotated. A node whose value is empty or not in its
 * table has no `tableValue`. Idempotent.
 *
 * @example
 *   ```ts
 *   unified()
 *   .use(hl7v2AnnotateProfileContext)
 *   .use(hl7v2AnnotateProfileFields)
 *   .use(hl7v2AnnotateProfileDatatypes)
 *   .use(hl7v2AnnotateProfileTables);
 *   // v2.5 `PID|1||12345||Doe||19800101|M`:
 *   // the PID-8 field repetition gets
 *   // data.tableValue = { value: "M", description: "Male" }
 *   ```
 */
export const hl7v2AnnotateProfileTables: Plugin<[], Root, Root> =
  () => (tree: Root, file: VFile) => {
    const tables = file.data.profile?.tables;
    if (!tables) {
      return tree;
    }

    visit(
      tree,
      // Test: which nodes are visited. Primitive field repetitions,
      // components, and subcomponents bound to a table.
      (node): node is CodedPrimitive =>
        (node.type === "field-repetition" ||
          node.type === "component" ||
          node.type === "subcomponent") &&
        node.data?.kind === "primitive" &&
        node.data.table !== undefined,
      // Visitor: what happens to each. Look the value up in the node's table
      // and, on a match, write the entry to `data.tableValue`.
      (node) => {
        const value = primitiveValue(node);
        const entry = value
          ? tables.get(node.data.table)?.codes.get(value)
          : undefined;
        if (value && entry) {
          node.data.tableValue = { description: entry.description, value };
        }
      }
    );

    return tree;
  };

export default hl7v2AnnotateProfileTables;
