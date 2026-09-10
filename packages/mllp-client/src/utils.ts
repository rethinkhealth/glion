/**
 * Reading a single value out of an HL7v2 tree.
 *
 * No bytes, no MLLP, no client. Staged here so it can move to
 * `@glion/util-query` without dragging any of those with it.
 *
 * @module
 */

import type { Root } from "@glion/ast";
import { value } from "@glion/util-query";

/** The value at `path`, or `""` when the field is absent. */
export function read(tree: Root, path: string): string {
  return value(tree, path)?.value ?? "";
}
