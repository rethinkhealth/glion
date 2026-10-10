// oxlint-disable-next-line no-unused-vars -- triggers VFile DataMap augmentation
import type { ProfileContext } from "@glion/annotate-profile-context";
import type { Root, Segment } from "@glion/ast";
import { SKIP, visit } from "@glion/util-visit";
import { isEmptyNode } from "@glion/utils";
import { lintRule } from "unified-lint-rule";

/**
 * Strip the "HL7" prefix from table IDs in field profiles.
 * Field profiles reference tables as "HL70001"; the tables store uses "0001".
 */
function normalizeTableId(tableRef: string): string {
  return tableRef.replace(/^HL7/, "");
}

/** The HL7v2 coded element datatypes (§2.A), whose first component is the code. */
const CODED_ELEMENTS: ReadonlySet<string> = new Set(["CE", "CF", "CNE", "CWE"]);

/** The HL7v2 primitive datatypes of a coded value (§2.A): `ID` and `IS`. */
const CODED_VALUES: ReadonlySet<string> = new Set(["ID", "IS"]);

/**
 * Whether the first component of a field of `datatype` holds the code from the
 * field's table: a primitive, a coded element, or a composite whose first
 * component is a coded value or a coded element.
 */
function holdsCode(ctx: ProfileContext, datatype: string): boolean {
  if (CODED_ELEMENTS.has(datatype)) {
    return true;
  }
  const definition = ctx.datatypes.get(datatype);
  if (definition?.kind === "primitive") {
    return true;
  }
  const first = definition?.componentsBySequence.get(1)?.datatypeId;
  return (
    first !== undefined &&
    (CODED_VALUES.has(first) || CODED_ELEMENTS.has(first))
  );
}

function resolveHl7Table(
  ctx: ProfileContext,
  segmentName: string,
  sequence: number
) {
  const fieldProfile = ctx.fields.get(segmentName)?.bySequence.get(sequence);
  const datatype = fieldProfile?.datatype;
  if (!fieldProfile?.table || datatype === undefined) {
    return;
  }
  if (!holdsCode(ctx, datatype)) {
    return;
  }
  const tableId = normalizeTableId(fieldProfile.table);
  const tableDef = ctx.tables.get(tableId);
  // Only HL7-defined tables are validated; user tables hold site-specific codes.
  if (tableDef?.type !== "hl7") {
    return;
  }
  return { fieldProfile, tableDef, tableId };
}

/**
 * Lint rule that validates coded field values against HL7-type tables.
 *
 * For each field that references a table in its profile, loads the table
 * definition and checks that the field's first component value is a valid
 * code in that table.
 *
 * Only fields whose first component holds the code are checked: a primitive,
 * a coded element (CE, CF, CNE, CWE), or a composite whose first component is
 * `ID`, `IS`, or a coded element. Only `hl7`-type tables are validated.
 * `user`-type tables are skipped (they contain site-specific codes).
 *
 * Empty fields are skipped. Segments without a known profile are skipped.
 *
 * @example
 *   ```typescript
 *   unified().use(hl7v2LintTableValues);
 *   ```;
 */
const hl7v2LintTableValues = lintRule<Root>(
  { origin: "hl7v2-lint:table-values" },
  (tree, file) => {
    const ctx = file.data.profile;
    if (!ctx) {
      return;
    }

    visit(tree, "field", (fieldNode, ancestors, info) => {
      // Check emptiness first — avoids lookups for the majority of fields
      if (isEmptyNode(fieldNode)) {
        return SKIP;
      }

      const segment = ancestors.at(-1) as Segment | undefined;
      if (!segment || segment.type !== "segment") {
        return SKIP;
      }

      const resolved = resolveHl7Table(ctx, segment.name, info.sequence);
      if (!resolved) {
        return SKIP;
      }
      const { fieldProfile, tableId, tableDef } = resolved;

      // Check each repetition's coded value against the table
      for (const repetition of fieldNode.children) {
        const sub = repetition?.children[0]?.children[0];
        if (!sub?.value) {
          continue;
        }
        const val = sub.value;

        if (!tableDef.codes.has(val)) {
          const name = fieldProfile.name ? ` (${fieldProfile.name})` : "";
          file.message(
            `Field ${segment.name}-${info.sequence}${name} value '${val}' is not in table ${tableId} (${tableDef.description})`,
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

export default hl7v2LintTableValues;
