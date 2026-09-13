/**
 * Reading a single value out of an HL7v2 tree.
 *
 * @module
 */

import type { Root } from "@glion/ast";
import { value } from "@glion/util-query";

/** The value at `path`, or `""` when the field is absent. */
export function read(tree: Root, path: string): string {
  return value(tree, path)?.value ?? "";
}
