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

// biome-ignore lint/performance/noBarrelFile: fine
export { EXIT, SKIP } from "unist-util-visit-parents";

export type { Predicate, Test, VisitInfo, Visitor } from "./types";

/**
 * A lookup of a node's index among its parent's children.
 *
 * Indexes a parent's children the first time one of them is looked up, and
 * at most once per lookup function.
 */
function createIndexOf(): (parent: Nodes, node: Nodes) => number {
  const indexes = new WeakMap<Nodes, Map<Nodes, number>>();

  return (parent, node) => {
    let children = indexes.get(parent);
    if (!children) {
      children = new Map(
        "children" in parent
          ? parent.children.map((child: Nodes, index: number) => [child, index])
          : []
      );
      indexes.set(parent, children);
    }
    return children.get(node) ?? 0;
  };
}

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

  const indexOf = createIndexOf();

  // Delegate traversal to unist-util-visit-parents
  visitParents(tree, (node, ancestors) => {
    // Only call visitor if node matches test
    if (!predicate(node, ancestors)) {
      return; // Continue traversal but skip visitor
    }

    // Compute HL7v2-specific context
    const parent = ancestors.at(-1);

    // For root node (no parent), use defaults
    // For children, look up their index in the parent's children array
    const childIndex = parent ? indexOf(parent, node) : 0;

    const info: VisitInfo = {
      depth: ancestors.length + 1,
      index: parent ? childIndex : 0,
      metadata:
        "name" in node && typeof node.name === "string"
          ? { name: node.name }
          : undefined,
      sequence: parent ? childIndex + 1 : 1,
    };

    // Call user visitor with augmented signature
    return visitor(node as T, ancestors, info);
  });
}
