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
    // Used as is: `visit` calls it with `(node, ancestors)`, so it may match on
    // a node's position in the tree as well as on the node itself.
    return test;
  }

  // Read once here rather than per visited node: a visit calls the predicate
  // for every node, and a test object changed during the visit does not change
  // which nodes match.
  const entries = Object.entries(test);

  return (node) =>
    entries.every(
      ([key, value]) =>
        // `Object.hasOwn` limits the match to the node's own properties. Without
        // it, `node[key]` also finds inherited members, so `{ constructor: x }`
        // or `{ toString: x }` would be compared against `Object.prototype`.
        // `Reflect.get(node, key)` is `node[key]`; it compiles for an arbitrary
        // string key, which `Nodes` (no index signature) does not allow.
        (Object.hasOwn(node, key) ? Reflect.get(node, key) : undefined) ===
        value
    );
}
