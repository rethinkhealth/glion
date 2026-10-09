import type { Nodes, Root, Segment } from "@glion/ast";
import type {
  EventSchema,
  RepairMissing,
  RepairUnexpected,
} from "@glion/profiles";
import { profiles, repair, runner } from "@glion/profiles";
import { value } from "@glion/util-query";
import { SKIP, visit } from "@glion/util-visit";
import { lintRule } from "unified-lint-rule";
import type { VFile } from "vfile";

/** The message a `definition` function chooses an event schema for. */
export interface SegmentOrderContext {
  tree: Root;
  file: VFile;
}

/**
 * Options for the segment order lint rule.
 */
export interface SegmentOrderOptions {
  /**
   * The event schema to validate against, or a function that returns the
   * one to use for a message. Default: the schema MSH-9 names.
   *
   * When the function returns `undefined`, the rule uses the schema MSH-9
   * names. Return the same object for every message that uses a schema: a
   * new object is compiled on its first run.
   */
  definition?:
    | EventSchema
    | ((
        context: SegmentOrderContext
      ) => EventSchema | undefined | Promise<EventSchema | undefined>);
  /**
   * Whether a Z-segment (a segment ID that starts with `Z`) that the event
   * schema does not name fits at any position. HL7v2 allows local Z-segments
   * in any message and segment group (v2.5.1 §2.11). When `false`, the rule
   * reports such a segment as unexpected. Default: `true`.
   */
  allowZSegments?: boolean;
}

/**
 * Lint rule that validates HL7v2 segment order against event schema
 * profiles.
 *
 * Verifies each segment appears in the order the event schema defines.
 *
 * **Resolution**: If no `definition` is provided, the rule resolves the
 * schema from MSH-12 (version) and MSH-9.3 (event schema), or MSH-9.1
 * and MSH-9.2 when MSH-9.3 is empty. If the schema is unavailable, the rule
 * reports nothing.
 *
 * **Behavior**: When the segments do not fit the schema, reports each edit of
 * the repair with the fewest: each segment the schema requires and the message
 * does not have, at the point it would be inserted, with `expected` its ID; and
 * each segment the message has and the schema does not allow there, on that
 * segment, with `actual` its ID. A Z-segment the schema does not name is
 * allowed anywhere unless `allowZSegments` is `false`.
 *
 * @example
 *   ```typescript
 *   // With the schema MSH-9 names:
 *   unified().use(hl7v2LintSegmentOrder);
 *
 *   // With a schema of your own:
 *   unified().use(hl7v2LintSegmentOrder, {
 *     definition: {
 *       elements: [
 *         { name: "MSH", optional: false, repeating: false, type: "segment" },
 *         { name: "PID", optional: false, repeating: false, type: "segment" },
 *       ],
 *       id: "ADT_SITE",
 *     },
 *   });
 *
 *   // With a schema chosen per message, and the one MSH-9 names otherwise:
 *   unified().use(hl7v2LintSegmentOrder, {
 *     definition: ({ tree }) =>
 *       isSiteMessage(tree) ? SITE_STRUCTURE : undefined,
 *   });
 *   ```;
 */
/**
 * The event schema MSH-12 and MSH-9 name: MSH-9.3, or MSH-9.1 and MSH-9.2,
 * which the events store resolves through the version's event map.
 */
const schemaOf = async (tree: Root): Promise<EventSchema | undefined> => {
  const version = value(tree, "MSH-12.1")?.value;
  if (!version) {
    return;
  }
  const id =
    value(tree, "MSH-9.3")?.value ||
    `${value(tree, "MSH-9.1")?.value ?? ""}_${value(tree, "MSH-9.2")?.value ?? ""}`;
  return await profiles.events.load(version, id);
};

/** A segment of the message, and its ancestors, inclusive. */
interface Located {
  node: Segment;
  ancestors: Nodes[];
}

/** `, in A > B` for the group IDs in `path`, or nothing at the top level. */
const inGroups = (path: readonly string[]): string =>
  path.length > 0 ? `, in ${path.join(" > ")}` : "";

/**
 * Reports a missing segment at a point: the start of the segment it comes
 * before, or the end of the message, with the nodes that hold that point.
 */
const reportMissing = (
  file: VFile,
  tree: Root,
  segments: readonly Located[],
  edit: RepairMissing
): void => {
  const next = segments[edit.index];
  const where = next ? `before '${next.node.name}'` : "at the end";
  const message = file.message(
    `Missing segment '${edit.segment}' (${where}${inGroups(edit.path)})`,
    next
      ? {
          ancestors: next.ancestors.slice(0, -1),
          place: next.node.position?.start,
        }
      : { ancestors: [tree], place: tree.position?.end }
  );
  message.expected = [edit.segment];
};

/** Reports an unexpected segment on itself. */
const reportUnexpected = (
  file: VFile,
  segments: readonly Located[],
  edit: RepairUnexpected
): void => {
  const at = segments[edit.index];
  const previous = segments[edit.index - 1];
  const where = previous ? `after '${previous.node.name}'` : "at the start";
  const message = file.message(
    `Unexpected segment '${edit.segment}' (${where}${inGroups(edit.path)})`,
    { ancestors: at?.ancestors, place: at?.node.position }
  );
  message.actual = edit.segment;
};

const hl7v2LintSegmentOrder = lintRule<Root, SegmentOrderOptions>(
  {
    origin: "hl7v2-lint:segment-order",
  },
  async (tree, file, options) => {
    const definition = options?.definition;
    const chosen =
      typeof definition === "function"
        ? await definition({ file, tree })
        : definition;
    const schema = chosen ?? (await schemaOf(tree));

    if (!schema) {
      return;
    }

    const segments: Located[] = [];
    visit(tree, "segment", (node, parents) => {
      segments.push({ ancestors: [...parents, node], node });
      return SKIP;
    });

    const input = segments.map(({ node }) => node.name);
    const runOptions = { allowZSegments: options?.allowZSegments };
    if (runner(schema, input, runOptions).type === "matched") {
      return;
    }

    for (const edit of repair(schema, input, runOptions)) {
      switch (edit.type) {
        case "missing": {
          reportMissing(file, tree, segments, edit);
          break;
        }
        case "unexpected": {
          reportUnexpected(file, segments, edit);
          break;
        }
      }
    }
  }
);

export default hl7v2LintSegmentOrder;
