import type { Root } from "@glion/ast";
import type {
  DatatypeDefinition,
  FieldDefinition,
  SegmentDefinition,
  TableDefinition,
} from "@glion/profiles";
import {
  loadDatatypes,
  loadFields,
  loadSegments,
  loadTables,
} from "@glion/profiles";
import { value } from "@glion/util-query";
import { visit } from "@glion/util-visit";
import type { Plugin } from "unified";
import type { VFile } from "vfile";

/** Resolved profile data attached to `file.data.profile` by this plugin. */
export interface ProfileContext {
  /** HL7v2 version extracted from MSH-12.1. */
  version: string;
  /** Field definitions indexed by segment name (e.g., "MSH", "PID"). */
  fields: ReadonlyMap<string, FieldDefinition>;
  /** Datatype definitions indexed by datatype ID (e.g., "ST", "CWE"). */
  datatypes: ReadonlyMap<string, DatatypeDefinition>;
  /** Table definitions indexed by normalized table ID (e.g., "0001"). */
  tables: ReadonlyMap<string, TableDefinition>;
  /** Segment definitions with titles, indexed by segment ID. */
  segments: SegmentDefinition;
}

declare module "vfile" {
  interface DataMap {
    profile?: ProfileContext | undefined;
  }
}

/**
 * Strip the "HL7" prefix from table IDs in field profiles.
 * Field profiles reference tables as "HL70001"; `loadTables` keys them "0001".
 */
function normalizeTableId(tableRef: string): string {
  return tableRef.replace(/^HL7/, "");
}

/**
 * Unified plugin that loads HL7v2 profile data (fields, datatypes, tables)
 * and attaches them to `file.data` for downstream consumers.
 *
 * Extracts the HL7v2 version from MSH-12.1, then loads all relevant
 * field definitions, datatype definitions (with cascading resolution),
 * and table definitions in a single pass. Unknown profiles are silently
 * skipped.
 *
 * The plugin is idempotent — if `file.data.fields` is already populated,
 * it returns immediately without reloading.
 *
 * @example
 *   ```typescript
 *   import { unified } from "unified";
 *   import { hl7v2Parser } from "@glion/parser";
 *   import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
 *
 *   const processor = unified()
 *     .use(hl7v2Parser)
 *     .use(hl7v2AnnotateProfileContext);
 *   ```;
 */
export const hl7v2AnnotateProfileContext: Plugin<[], Root, Root> =
  () => async (tree: Root, file: VFile) => {
    // Idempotency: skip if already populated
    if (file.data.profile) {
      return tree;
    }

    const version = value(tree, "MSH-12.1")?.value;
    if (!version) {
      return tree;
    }

    const [
      fieldsOfVersion,
      datatypesOfVersion,
      tablesOfVersion,
      segmentsOfVersion,
    ] = await Promise.all([
      loadFields(version),
      loadDatatypes(version),
      loadTables(version),
      loadSegments(version),
    ]);

    const fields = pick(segmentNames(tree), fieldsOfVersion);
    const datatypes = pick(
      datatypeIds(fields, datatypesOfVersion),
      datatypesOfVersion
    );
    const tables = pick(tableIds(fields), tablesOfVersion);

    const segments = segmentsOfVersion ?? { byId: new Map() };

    file.data.profile = { datatypes, fields, segments, tables, version };

    return tree;
  };

// ---------------------------------------------------------------------------
// Referenced ids
// ---------------------------------------------------------------------------

/** The names of the segments in `tree`. */
function segmentNames(tree: Root): Set<string> {
  const names = new Set<string>();
  visit(tree, "segment", (node) => {
    names.add(node.name);
  });
  return names;
}

/**
 * The datatypes the fields reference, cascading through composite datatypes
 * to their component and subcomponent datatypes (2 levels).
 */
function datatypeIds(
  fields: ReadonlyMap<string, FieldDefinition>,
  datatypes: ReadonlyMap<string, DatatypeDefinition> | undefined
): Set<string> {
  const ids = new Set<string>();
  for (const def of fields.values()) {
    for (const field of def.bySequence.values()) {
      ids.add(field.datatype);
    }
  }

  const componentsOf = (id: string): string[] => {
    const def = datatypes?.get(id);
    return def?.kind === "composite"
      ? [...def.componentsBySequence.values()].map((comp) => comp.datatypeId)
      : [];
  };

  let level = [...ids];
  for (let depth = 0; depth < 2; depth++) {
    level = [...new Set(level.flatMap(componentsOf))].filter(
      (id) => !ids.has(id)
    );
    for (const id of level) {
      ids.add(id);
    }
  }

  return ids;
}

/** The tables the fields reference, by `loadTables` key. */
function tableIds(fields: ReadonlyMap<string, FieldDefinition>): Set<string> {
  const ids = new Set<string>();
  for (const def of fields.values()) {
    for (const field of def.bySequence.values()) {
      if (field.table) {
        ids.add(normalizeTableId(field.table));
      }
    }
  }
  return ids;
}

/** The entries of `profiles` for `ids`; ids it has no entry for are omitted. */
function pick<T>(
  ids: Iterable<string>,
  profiles: ReadonlyMap<string, T> | undefined
): Map<string, T> {
  const picked = new Map<string, T>();
  for (const id of ids) {
    const profile = profiles?.get(id);
    if (profile) {
      picked.set(id, profile);
    }
  }
  return picked;
}

export default hl7v2AnnotateProfileContext;
