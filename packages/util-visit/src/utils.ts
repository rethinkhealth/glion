import type { Nodes } from "@glion/ast";

import type { Predicate, Test } from "./types";

/**
 * Create test predicate from various input types.
 *
 * Assumptions:
 *
 * - Null test matches all nodes
 * - String test matches by node.type property
 * - Object test uses strict equality (===) for property matching
 * - Explicit undefined values in test object check for property absence
 * - Dangerous keys (**proto**, constructor, prototype) are filtered for security
 *
 * @param test - Filter criteria: null (all), string (type), object
 *   (properties), or function
 * @returns Predicate function that returns true if node matches test criteria
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
  // Object property matching
  return (node) => {
    for (const [key, testValue] of Object.entries(test)) {
      // Guard against prototype pollution
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        continue;
      }

      const nodeValue: unknown = Reflect.get(node, key);

      // If test has explicit undefined, check property doesn't exist or is undefined
      if (testValue === undefined) {
        if (Object.hasOwn(node, key) && nodeValue !== undefined) {
          return false;
        }
      } else if (nodeValue !== testValue) {
        // For non-undefined values, strict equality check
        return false;
      }
    }
    return true;
  };
}
