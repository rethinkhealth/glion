import type { Nodes } from "@glion/ast";

import type { Predicate, Test } from "./types";

/**
 * The predicate a `visit` test describes.
 *
 * - `null` matches every node.
 * - A string matches nodes whose `type` equals it.
 * - A function is the predicate.
 * - An object matches nodes whose own property equals (`===`) each of its values.
 *   A property the node does not own reads as `undefined`, so an `undefined`
 *   value matches an absent property, and a key that names an inherited member
 *   (`constructor`, `toString`, an own `__proto__`) matches no node. The
 *   object's entries are read once, when the predicate is created.
 *
 * @param test - `null`, a node type, a property object, or a predicate.
 * @returns The predicate.
 */
export function createTest(test: Test<Nodes>): Predicate {
  if (test === null) {
    return () => true;
  }
  if (typeof test === "string") {
    return (node) => node.type === test;
  }
  if (typeof test === "function") {
    return test;
  }

  const entries = Object.entries(test);
  return (node) =>
    entries.every(
      ([key, value]) =>
        (Object.hasOwn(node, key) ? Reflect.get(node, key) : undefined) ===
        value
    );
}
