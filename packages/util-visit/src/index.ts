/**
 * HL7v2 AST Visitor
 *
 * Wraps unist-util-visit-parents to add HL7v2-specific context
 * (index, sequence, depth, metadata) while delegating core traversal.
 */

import type { Nodes } from "@glion/ast";
import { visitParents } from "unist-util-visit-parents";

import type { Test, VisitInfo, Visitor } from "./types";
import { createTest } from "./utils";

export type { VisitorResult } from "unist-util-visit-parents";

export { EXIT, SKIP } from "unist-util-visit-parents";

export type { Predicate, Test, VisitInfo, Visitor } from "./types";

// How far below its segment each node type sits; root and group are not in a
// segment. HL7v2 nests segment → field → repetition → component →
// subcomponent, so a node's segment and the sequences of everything between
// them sit at fixed depths above it.
const LEVELS_BELOW_SEGMENT: Record<Nodes["type"], number | undefined> = {
  component: 3,
  field: 1,
  "field-repetition": 2,
  group: undefined,
  root: undefined,
  segment: 0,
  subcomponent: 4,
};

// Overload signatures
export function visit(tree: Nodes, visitor: Visitor): void;
export function visit<Type extends Nodes["type"]>(
  tree: Nodes,
  test: Type,
  visitor: Visitor<Extract<Nodes, { type: Type }>>
): void;
export function visit<T extends Nodes>(
  tree: Nodes,
  test: Test<T>,
  visitor: Visitor<T>
): void;

/**
 * Visit nodes in an HL7 AST tree.
 * Wraps unist-util-visit-parents to add HL7v2-specific context.
 *
 * @param tree - The tree to traverse (can be any node type, not just Root)
 * @param test - Optional test to filter nodes (type string, partial match, or
 *   Test function)
 * @param visitor - Function called for each matching node
 *
 *   **Important**: If you pass a function as the second argument, it is always
 *   treated as a Visitor, never as a Test. To use a Test function, you MUST
 *   provide both the test and visitor parameters: `visit(tree, testFn,
 *   visitorFn)`.
 */
export function visit<T extends Nodes>(
  tree: Nodes,
  arg2: Visitor<T> | Test<T>,
  arg3?: Visitor<T>
): void {
  let test: Test<T> = null;
  let visitor: Visitor<T>;

  if (arg3 === undefined) {
    visitor = arg2 as Visitor<T>;
  } else {
    test = arg2 as Test<T>;
    visitor = arg3;
  }

  const predicate = createTest(test as Test<Nodes>);

  // visit-parents passes a node's index among its parent's children only to
  // its test, `test(node, index, parent)`, never to its visitor. It calls the
  // test and, when the test passes, the visitor on that same node with nothing
  // in between (unist-util-visit-parents 6.0.2, lib/index.js; the version is
  // pinned). `captureIndex` is that test: it stores the index for the visitor
  // to read and passes every node. The index is the node's position when it
  // is visited, so it reflects siblings a visitor inserted or removed earlier.
  let currentIndex = 0;
  const captureIndex = (_node: unknown, index?: number): boolean => {
    // The node `visit` starts from has no parent, so it has no index.
    currentIndex = index ?? 0;
    return true;
  };

  // `sequences[depth]` is the 1-based sequence of the node open at that depth,
  // kept current for every node so a matched node can read its ancestors'
  // sequences. Depth 0 is the node `visit` starts from, whose sequence is
  // unknown, so it is never read.
  // Stryker disable next-line ArrayDeclaration: index 0 is written before any read.
  const sequences: number[] = [];

  // The sequence `levels` below the segment that sits at `segmentDepth`, or
  // `undefined` when the node is not that deep (`level` is how far below its
  // segment the node itself sits) or that position is the visit's start.
  const sequenceAt = (
    segmentDepth: number,
    level: number,
    levels: number
  ): number | undefined => {
    const depth = segmentDepth + levels;
    return levels <= level && depth >= 1 ? sequences[depth] : undefined;
  };

  visitParents(tree, captureIndex, (node, ancestors) => {
    const depth = ancestors.length;
    sequences[depth] = currentIndex + 1;

    // The caller's test runs here, not in `captureIndex`: it may read
    // `ancestors`, which visit-parents gives only to the visitor.
    if (!predicate(node, ancestors)) {
      // Returning nothing means "continue": visit-parents still walks into
      // this node's children, so `visit(tree, "field", …)` reaches the fields
      // of segments it does not match.
      return;
    }

    // A root or group has no segment: -1 puts its "segment" below it, where
    // `ancestors` has nothing, and every `sequenceAt` level is out of range.
    const level = LEVELS_BELOW_SEGMENT[node.type] ?? -1;
    const segmentDepth = depth - level;
    // `ancestors[depth]` is past the end, so a segment finds itself. A depth
    // outside `ancestors` (the segment is above the visit's start) also falls
    // back to the node, which the type check below then rejects.
    const segment = ancestors[segmentDepth] ?? node;

    const info: VisitInfo = {
      component: sequenceAt(segmentDepth, level, 3),
      depth: depth + 1,
      field: sequenceAt(segmentDepth, level, 1),
      index: currentIndex,
      metadata: "name" in node ? { name: node.name } : undefined,
      repetition: sequenceAt(segmentDepth, level, 2),
      segment: segment.type === "segment" ? segment : undefined,
      sequence: currentIndex + 1,
      subcomponent: sequenceAt(segmentDepth, level, 4),
    };

    // visit-parents reads the visitor's return value to decide what to visit
    // next, so the caller's result is passed through unchanged:
    // - nothing or CONTINUE: walk into this node's children;
    // - SKIP: skip this node's children;
    // - EXIT: stop the walk;
    // - a number: continue at that index among this node's siblings, as after
    //   removing the current node with `splice(info.index, 1)`;
    // - [action, index]: both.
    // Calling the visitor without returning its result would turn every one
    // of these into "continue".
    return visitor(node as T, ancestors, info);
  });
}
