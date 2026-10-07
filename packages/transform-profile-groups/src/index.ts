import type { Group, Root, Segment } from "@glion/ast";
import type { EventSchema, SegmentMatch } from "@glion/profiles";
import { profiles, runner } from "@glion/profiles";
import { value } from "@glion/util-query";
import { EXIT, SKIP, visit } from "@glion/util-visit";
import type { Plugin } from "unified";
import type { VFile } from "vfile";

/** The message a `definition` function chooses an event schema for. */
export interface TransformProfileGroupsContext {
  tree: Root;
  file: VFile;
}

/** Options for {@link hl7v2TransformProfileGroups}. */
export interface TransformProfileGroupsOptions {
  /**
   * The event schema to group by, or a function that returns the one to use
   * for a message. Default: the schema MSH-9 names.
   *
   * When the function returns `undefined`, the plugin uses the schema MSH-9
   * names. Return the same object for every message that uses a schema: a
   * new object is compiled on its first run.
   */
  definition?:
    | EventSchema
    | ((
        context: TransformProfileGroupsContext
      ) => EventSchema | undefined | Promise<EventSchema | undefined>);
  /**
   * Whether a Z-segment (a segment ID that starts with `Z`) that the event
   * schema does not name fits at any position. HL7v2 allows local Z-segments
   * in any message and segment group (v2.5.1 §2.11). When `false`, such a
   * segment leaves the tree flat. Default: `true`.
   */
  allowZSegments?: boolean;
}

/**
 * The bundled event schema MSH-12 and MSH-9 name: MSH-9.3, or MSH-9.1 and
 * MSH-9.2, which the events store resolves through the version's event map.
 * `undefined` when MSH-12 is empty or the version bundles no such schema.
 */
const bundledEventSchema = async (
  tree: Root
): Promise<EventSchema | undefined> => {
  const version = value(tree, "MSH-12.1")?.value;
  if (!version) {
    return;
  }
  const id =
    value(tree, "MSH-9.3")?.value ||
    `${value(tree, "MSH-9.1")?.value ?? ""}_${value(tree, "MSH-9.2")?.value ?? ""}`;
  return await profiles.events.load(version, id);
};

/**
 * The tree node of one match: the segment it indexes, or a `Group` of its
 * children's nodes, positioned from the start of its first segment to the
 * end of its last.
 */
const nodeOf = (
  match: SegmentMatch,
  segments: readonly Segment[]
): Group | Segment => {
  if (typeof match === "number") {
    const segment = segments[match];
    if (!segment) {
      throw new Error(
        `@glion/transform-profile-groups: a match indexes segment ${match} of ${segments.length}; this is a bug, please report it`
      );
    }
    return segment;
  }
  const children = match.children.map((child) => nodeOf(child, segments));
  const group: Group = {
    children,
    id: match.id,
    name: match.name,
    type: "group",
  };
  const start = children[0]?.position?.start;
  const end = children.at(-1)?.position?.end;
  if (start && end) {
    group.position = { end, start };
  }
  return group;
};

/**
 * Unified plugin that nests a message's segments in the segment groups its
 * event schema defines, such as `PATIENT_RESULT` and `ORDER_OBSERVATION`.
 *
 * Groups by `options.definition`, or else by the schema MSH-12 and MSH-9
 * name. Replaces the root's children with `Group` nodes holding the same
 * segment nodes, in the same order. A group's position spans its first to its
 * last segment. A Z-segment the schema does not name goes right after the
 * segment before it, in that segment's group, unless `options.allowZSegments`
 * is `false`.
 *
 * Runs only on a tree that holds segments and no group: a tree that already
 * holds a group, from this plugin or another, is left as it is, and
 * `options.definition` is not called for it. Also leaves the tree
 * unchanged when there is no event schema or when the segments do not fit
 * it. Idempotent.
 *
 * @throws {Error} When the event schema is invalid (see `runner`), or a
 *   bundled event schema fails to load.
 */
export const hl7v2TransformProfileGroups: Plugin<
  [TransformProfileGroupsOptions?],
  Root,
  Root
> = (options) => async (tree, file) => {
  // A group means the tree is grouped already, by this plugin or another.
  let grouped = false;
  const segments: Segment[] = [];
  visit(tree, (node) => {
    if (node.type === "group") {
      grouped = true;
      return EXIT;
    }
    if (node.type === "segment") {
      segments.push(node);
      return SKIP;
    }
  });
  if (grouped || segments.length === 0) {
    return tree;
  }

  const definition = options?.definition;
  const chosen =
    typeof definition === "function"
      ? await definition({ file, tree })
      : definition;
  const schema = chosen ?? (await bundledEventSchema(tree));
  if (!schema) {
    return tree;
  }

  const result = runner(
    schema,
    segments.map((segment) => segment.name),
    { allowZSegments: options?.allowZSegments }
  );
  switch (result.type) {
    case "matched": {
      tree.children = result.groups.map((match) => nodeOf(match, segments));
      break;
    }
    case "mismatched":
    case "incomplete": {
      break;
    }
  }
  return tree;
};

export default hl7v2TransformProfileGroups;
