import type { Nodes, Root, Segment } from "@glion/ast";
import type {
  EventSchema,
  RepairEdit,
  RunnerIncomplete,
  RunnerMismatched,
} from "@glion/profiles";
import { profiles, repair, runner } from "@glion/profiles";
import { value } from "@glion/util-query";
import { SKIP, visit } from "@glion/util-visit";
import pluralize from "pluralize";
import { lintRule } from "unified-lint-rule";
import type { VFile } from "vfile";

/**
 * The most segments a message may have for the rule to report every missing
 * and out-of-place segment. A longer message gets the first segment that does
 * not fit. The repair's memory grows with segments × program size; at the
 * largest bundled program (454 instructions), 1,000 segments take about 4 MB.
 */
const MAX_REPAIRED_SEGMENTS = 1000;

/**
 * The most edits reported for one message, before a count of the rest; one
 * more when the last is a missing segment and the next the out-of-place
 * segment standing where it belongs.
 */
const MAX_REPORTED_EDITS = 20;

/** The name an event schema gives a slot that any segment fills. */
const ANY_SEGMENT = "Hxx";

/** The name an event schema gives a slot that any Z-segment fills. */
const ANY_Z_SEGMENT = "anyZSegment";

const segmentIds = new Intl.ListFormat("en", { type: "disjunction" });

const counts = new Intl.NumberFormat("en");

/** A segment ID the event schema names, as a message writes it. */
const written = (id: string): string => {
  switch (id) {
    case ANY_SEGMENT: {
      return "any segment";
    }
    case ANY_Z_SEGMENT: {
      return "any Z-segment";
    }
    default: {
      return `\`${id}\``;
    }
  }
};

/** The segment IDs a slot takes, without the any-segment slots. */
const segmentIdsOnly = (ids: readonly string[]): string[] =>
  ids.filter((id) => id !== ANY_SEGMENT && id !== ANY_Z_SEGMENT);

const messages = {
  endsBeforeComplete: (expected: readonly string[]) =>
    `The message ends before its event schema is complete; the event schema requires ${segmentIds.format(expected.map(written))} next.`,
  missingAnySegment:
    "A segment is missing; the event schema requires a segment with any Segment ID at this point.",
  missingAnySegmentInGroup: (groups: string) =>
    `A segment of segment group \`${groups}\` is missing; the event schema requires a segment with any Segment ID at this point.`,
  missingAnyZSegment:
    "A Z-segment is missing; the event schema requires a Z-segment at this point.",
  missingAnyZSegmentInGroup: (groups: string) =>
    `A Z-segment of segment group \`${groups}\` is missing; the event schema requires a Z-segment at this point.`,
  missingSegment: (segmentId: string) =>
    `Segment \`${segmentId}\` is missing; the event schema requires it at this point.`,
  missingSegmentInGroup: (segmentId: string, groups: string) =>
    `Segment \`${segmentId}\` of segment group \`${groups}\` is missing; the event schema requires it at this point.`,
  moreEdits: (count: number, reported: number) =>
    `The message has ${pluralize("more missing or out-of-place segment", count, true)}; the rule reports the first ${reported}.`,
  unexpectedSegment:
    "The segment is out of place; the event schema does not allow it at this point.",
} as const;

const notes = {
  notRepairedEnd: (segmentCount: number) =>
    `The message has ${counts.format(segmentCount)} segments; above ${counts.format(MAX_REPAIRED_SEGMENTS)}, the rule reports only where the message ends, not every missing or out-of-place segment.`,
  notRepairedMisfit: (segmentCount: number) =>
    `The message has ${counts.format(segmentCount)} segments; above ${counts.format(MAX_REPAIRED_SEGMENTS)}, the rule reports only the first segment that does not fit, not every missing or out-of-place segment.`,
  unrepairedEnd:
    "The rule could not list every missing or out-of-place segment in this message, so it reports only where the message ends. This is a bug; please report it.",
  unrepairedMisfit:
    "The rule could not list every missing or out-of-place segment in this message, so it reports only the first segment that does not fit. This is a bug; please report it.",
} as const;

/** The notes a report of the first segment that does not fit carries. */
interface MisfitNotes {
  /** When a segment does not fit. */
  misfit: string;
  /** When the message ends before its event schema is complete. */
  end: string;
}

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
   * schema does not name fits at any position. Every HL7v2 version reserves
   * Segment IDs that start with `Z` for local use, and tells the recipient to
   * ignore a segment it does not expect. When `false`, the rule
   * reports such a segment as unexpected. Default: `true`.
   */
  allowZSegments?: boolean;
}

/**
 * The event schema MSH-12 and MSH-9 name: MSH-9.3, or MSH-9.1 and MSH-9.2,
 * which the events store resolves through the version's event map.
 */
const schemaOf = async (tree: Root): Promise<EventSchema | undefined> => {
  const version = value(tree, "MSH.12.1")?.value;
  // Stryker disable next-line ConditionalExpression,BlockStatement: the events store loads no schema for an empty or absent version either
  if (!version) {
    return;
  }
  const id =
    value(tree, "MSH.9.3")?.value ||
    // Stryker disable next-line StringLiteral: with MSH-9.1 or MSH-9.2 absent, no event schema or event map entry matches the ID either way
    `${value(tree, "MSH.9.1")?.value ?? ""}_${value(tree, "MSH.9.2")?.value ?? ""}`;
  return await profiles.events.load(version, id);
};

/** A segment of the message, and its ancestors, inclusive. */
interface Located {
  node: Segment;
  ancestors: Nodes[];
}

/** The reason for a missing segment, by the slot the schema names. */
const missingReason = (segment: string, path: readonly string[]): string => {
  const groups = path.join(" > ");
  switch (segment) {
    case ANY_SEGMENT: {
      return path.length === 0
        ? messages.missingAnySegment
        : messages.missingAnySegmentInGroup(groups);
    }
    case ANY_Z_SEGMENT: {
      return path.length === 0
        ? messages.missingAnyZSegment
        : messages.missingAnyZSegmentInGroup(groups);
    }
    default: {
      return path.length === 0
        ? messages.missingSegment(segment)
        : messages.missingSegmentInGroup(segment, groups);
    }
  }
};

/**
 * How many edits to report: `MAX_REPORTED_EDITS`, or one more when the last
 * of those is a missing segment and the next is the out-of-place segment
 * standing where it belongs.
 */
const reportedCount = (edits: readonly RepairEdit[]): number => {
  const last = edits[MAX_REPORTED_EDITS - 1];
  const next = edits[MAX_REPORTED_EDITS];
  const splitsPair =
    // Stryker disable next-line ConditionalExpression: an unexpected edit consumes its segment, so the edit after it never shares its index
    last?.type === "missing" &&
    next?.type === "unexpected" &&
    next.index === last.index;
  return splitsPair ? MAX_REPORTED_EDITS + 1 : MAX_REPORTED_EDITS;
};

/**
 * Reports each edit of the repair, up to `reportedCount()`, then a count of
 * the rest.
 */
const reportEdits = (
  file: VFile,
  tree: Root,
  segments: readonly Located[],
  edits: readonly RepairEdit[]
): void => {
  const reported = reportedCount(edits);
  for (const edit of edits.slice(0, reported)) {
    switch (edit.type) {
      case "missing": {
        const reason = missingReason(edit.segment, edit.path);
        const next = segments[edit.index];
        const message = next
          ? file.message(reason, {
              ancestors: next.ancestors.slice(0, -1),
              place: next.node.position?.start,
            })
          : file.message(reason, {
              ancestors: [tree],
              place: tree.position?.end,
            });
        const expected = segmentIdsOnly([edit.segment]);
        if (expected.length > 0) {
          message.expected = expected;
        }
        break;
      }
      case "unexpected": {
        const at = segments[edit.index];
        // Stryker disable all: repair() reports unexpected segments at indexes inside the message, so this guard never fires
        if (!at) {
          throw new Error(
            `repair() reported an unexpected segment at index ${edit.index} of a ${segments.length}-segment message. This is a bug; please report it.`
          );
        }
        // Stryker restore all
        const message = file.message(messages.unexpectedSegment, {
          ancestors: at.ancestors,
          place: at.node.position,
        });
        message.actual = edit.segment;
        break;
      }
    }
  }
  if (edits.length > reported) {
    file.message(messages.moreEdits(edits.length - reported, reported), {
      ancestors: [tree],
      place: tree.position,
    });
  }
};

/** Reports the first segment that does not fit, as the runner found it. */
const reportFirstMisfit = (
  file: VFile,
  tree: Root,
  segments: readonly Located[],
  result: RunnerMismatched | RunnerIncomplete,
  note: MisfitNotes
): void => {
  switch (result.type) {
    case "mismatched": {
      const at = segments[result.index];
      // Stryker disable all: runner() reports a mismatch at an index inside the message, so this guard never fires
      if (!at) {
        throw new Error(
          `runner() reported a mismatch at index ${result.index} of a ${segments.length}-segment message. This is a bug; please report it.`
        );
      }
      // Stryker restore all
      const message = file.message(messages.unexpectedSegment, {
        ancestors: at.ancestors,
        place: at.node.position,
      });
      message.actual = at.node.name;
      const expected = segmentIdsOnly(result.expected);
      if (expected.length > 0) {
        message.expected = expected;
      }
      message.note = note.misfit;
      break;
    }
    case "incomplete": {
      const message = file.message(
        messages.endsBeforeComplete(result.expected),
        { ancestors: [tree], place: tree.position?.end }
      );
      const expected = segmentIdsOnly(result.expected);
      if (expected.length > 0) {
        message.expected = expected;
      }
      message.note = note.end;
      break;
    }
  }
};

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
 * segment, with `actual` its ID. Reports at most 20 edits, or 21 when the 21st
 * is the out-of-place segment standing where the 20th, a missing one, belongs,
 * then one message with the count of the rest. A message of more than 1,000
 * segments gets one report: the first segment that does not fit, with
 * `expected` the segment IDs valid there, or the end of the message when it
 * ends early. A Z-segment the schema does not name is allowed anywhere unless
 * `allowZSegments` is `false`.
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
const hl7v2LintSegmentOrder = lintRule<Root, SegmentOrderOptions>(
  {
    origin: "hl7v2-lint:segment-order",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-segment-order#readme",
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
    const result = runner(schema, input, runOptions);
    switch (result.type) {
      // Stryker disable next-line ConditionalExpression,BlockStatement,StringLiteral: a matched message reaches no report either way: repair() finds no edits for it and reportFirstMisfit has no arm for it
      case "matched": {
        return;
      }
      case "mismatched":
      case "incomplete": {
        if (segments.length > MAX_REPAIRED_SEGMENTS) {
          reportFirstMisfit(file, tree, segments, result, {
            end: notes.notRepairedEnd(segments.length),
            misfit: notes.notRepairedMisfit(segments.length),
          });
          return;
        }
        const edits = repair(schema, input, runOptions);
        if (edits.length === 0) {
          reportFirstMisfit(file, tree, segments, result, {
            end: notes.unrepairedEnd,
            misfit: notes.unrepairedMisfit,
          });
          return;
        }
        reportEdits(file, tree, segments, edits);
      }
    }
  }
);

export default hl7v2LintSegmentOrder;
