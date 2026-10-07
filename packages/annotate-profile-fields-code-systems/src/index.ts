import type { Field, Nodes, Root } from "@glion/ast";
import type { CodeSystemDefinition } from "@glion/profiles";
import { profiles } from "@glion/profiles";
import { SKIP, visit } from "@glion/util-visit";
import type { Plugin } from "unified";
import type { VFile } from "vfile";

/** Visit predicate: only visit field nodes that have a table reference. */
function isCodedField(node: Nodes): node is Field {
  return (
    node.type === "field" &&
    typeof (node.data as Record<string, unknown> | undefined)?.table ===
      "string"
  );
}

declare module "@glion/ast" {
  interface FieldData {
    /** Resolved UTG code system identity for this field's table reference. */
    codeSystem?: { id: string; name: string; title: string } | undefined;
  }
  interface FieldRepetitionData {
    /** Resolved code entry for this repetition's primary value. */
    code?: { value: string; display: string; status: string } | undefined;
  }
}

/**
 * Convert a field profile table reference to a UTG code system ID.
 * Field profiles use "HL70001"; UTG code systems use "v2-0001".
 */
function tableIdToCodeSystemId(tableRef: string): string {
  return `v2-${tableRef.replace(/^HL7/, "")}`;
}

/**
 * Unified plugin that annotates coded fields with their resolved UTG
 * code system identity (on the field) and the display/status of each
 * repetition's primary value (on the field-repetition).
 *
 * Per the HL7v2 spec, when a field has a table binding and a composite
 * datatype (CWE/CNE), the table constrains CWE.1 — the first component's
 * first subcomponent. This plugin reads that value from each repetition,
 * resolves it against the UTG code system, and attaches:
 *
 * - `field.data.codeSystem` — code system identity (same for all reps)
 * - `rep.data.code` — resolved value entry (different per rep)
 *
 * Requires the fields annotator to run first (preset guarantees ordering).
 */
export const hl7v2AnnotateProfileFieldsCodeSystems: Plugin<[], Root, Root> =
  () => async (tree: Root, file: VFile) => {
    // Collect table references from field.data.table (set by fields annotator)
    const tableRefs = new Set<string>();
    visit(tree, isCodedField, (node) => {
      tableRefs.add((node.data as Record<string, unknown>).table as string);
    });

    // Resolve UTG code systems in parallel
    const codeSystems = new Map<string, CodeSystemDefinition>();
    const entries = [...tableRefs].map(
      (ref) => [ref, tableIdToCodeSystemId(ref)] as const
    );
    const results = await Promise.allSettled(
      entries.map(([, csId]) => profiles.codeSystems.load(csId))
    );

    for (const [i, result] of results.entries()) {
      const [tableRef] = entries[i] as (typeof entries)[number];
      if (result.status === "rejected") {
        const msg = file.message(
          `Failed to load code system for table '${tableRef}'`
        );
        msg.source = "hl7v2-annotate-profile-fields-code-systems";
        msg.cause = result.reason;
      } else if (result.value) {
        codeSystems.set(tableRef, result.value);
      }
    }

    // Annotate: codeSystem on field, resolved code on each repetition
    visit(tree, isCodedField, (node) => {
      const table = (node.data as Record<string, unknown>).table as string;
      const csDef = codeSystems.get(table);
      if (!csDef) {
        return SKIP;
      }

      // Code system identity on the field (same for all repetitions)
      (node.data as Record<string, unknown>).codeSystem = {
        id: csDef.id,
        name: csDef.name,
        title: csDef.title,
      };

      // Resolved value on each repetition
      for (const rep of node.children) {
        const primaryValue = rep.children[0]?.children[0]?.value;
        if (!primaryValue) {
          continue;
        }

        const entry = csDef.codes.get(primaryValue);
        if (!entry) {
          continue;
        }

        if (!rep.data) {
          rep.data = {};
        }
        rep.data.code = {
          display: entry.display,
          status: entry.status,
          value: primaryValue,
        };
      }

      return SKIP;
    });

    return tree;
  };

export default hl7v2AnnotateProfileFieldsCodeSystems;
