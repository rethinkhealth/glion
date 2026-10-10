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

  visitParents(tree, captureIndex, (node, ancestors) => {
    // The caller's test runs here, not in `captureIndex`: it may read
    // `ancestors`, which visit-parents gives only to the visitor.
    if (!predicate(node, ancestors)) {
      return;
    }

    const info: VisitInfo = {
      depth: ancestors.length + 1,
      index: currentIndex,
      metadata: "name" in node ? { name: node.name } : undefined,
      sequence: currentIndex + 1,
    };

    return visitor(node as T, ancestors, info);
  });
}
