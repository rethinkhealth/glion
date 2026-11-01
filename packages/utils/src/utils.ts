import type { Delimiters, Nodes } from "@glion/ast";

import { escapedLength } from "./escapes";

// -------------
// General
// -------------

/**
 * Check if an HL7v2 AST node is semantically empty.
 *
 * A node is empty when it contains no meaningful data — no subcomponent
 * anywhere in its subtree has a non-empty string value.
 *
 * A node is empty only when its value is an empty string or missing.
 * Whitespace-only values are considered non-empty because whitespace is
 * valid HL7v2 data.
 *
 * ## HL7v2 emptiness semantics
 *
 * | Encoding | Wire form | isEmpty? | Meaning |         |                                  |
 * | -------- | --------- | -------- | ------- | ------- | -------------------------------- |
 * | `value`  | `\        | value\   | `       | `false` | Field has data                   |
 * | `^DOE`   | `\        | ^DOE\    | `       | `false` | Component 2 has data             |
 * | `~value` | `\        | ~value\  | `       | `false` | Repetition 2 has data            |
 * | `""`     | `\        | ""\      | `       | `false` | Explicit null (delete indicator) |
 * | ` `      | `\        | \        | `       | `false` | Whitespace is valid data         |
 * | (empty)  | `\        | \        | `       | `true`  | Not present                      |
 * | `^^`     | `\        | ^^\      | `       | `true`  | Empty components                 |
 * | `~`      | `\        | ~\       | `       | `true`  | Empty repetitions                |
 * | `~^^`    | `\        | ~^^\     | `       | `true`  | Empty reps with empty components |
 *
 * @param node - The HL7v2 AST node to check (or null/undefined)
 * @returns `true` if the node has no meaningful data
 */
export function isEmptyNode(node?: Nodes | null | undefined): boolean {
  if (!node) {
    return true;
  }

  // Leaf node (Subcomponent): check its string value
  if ("value" in node) {
    return !node.value || node.value === "";
  }

  // Parent node: empty if ALL children are empty
  if ("children" in node) {
    if (!node.children || node.children.length === 0) {
      return true;
    }

    return node.children.every((child) => isEmptyNode(child));
  }

  // Fallback: consider unknown node as non-empty
  return false;
}

// -------------
// Byte Length
// -------------

/**
 * Calculate the byte length of any HL7v2 AST node.
 *
 * For literal nodes (Subcomponent), returns the UTF-8 byte length of the value.
 * For parent nodes, recursively calculates the length of all children.
 * Delimiters are NOT included.
 *
 * @example
 *   ```ts
 *   const field: Field = { type: "field", children: [...] };
 *   const length = getByteLength(field); // e.g., 42
 *   ```;
 *
 * @param node - The HL7v2 AST node to measure
 * @returns The total byte length of the node content
 */
export function getByteLength(node?: Nodes | null | undefined): number {
  if (!node) {
    return 0;
  }

  if ("value" in node) {
    return Buffer.byteLength(node.value, "utf8");
  }

  const nameLength =
    node.type === "segment" ? Buffer.byteLength(node.name, "utf8") : 0;

  return (
    nameLength +
    node.children.reduce((total, child) => total + getByteLength(child), 0)
  );
}

// -------------
// Length
// -------------

/**
 * Calculate the string length of any HL7v2 AST node.
 *
 * For literal nodes (Subcomponent), returns `value.length`, or with
 * `delimiters` the length HL7v2 §2.7.1 counts: the value as `escapes.write`
 * writes it, without the two escape characters of each escape sequence, so
 * `12\E\3` and a carriage return written `\X0D\` count 4 and 3; a character
 * no escape sequence can write with them counts 1. For parent
 * nodes, recursively calculates the length of all children. Delimiters are
 * NOT included.
 *
 * Note: Returns JavaScript string length (UTF-16 code units). For UTF-8 byte
 * length (e.g., for wire protocol), use `getByteLength` instead.
 *
 * @example
 *   ```ts
 *   const field: Field = { type: "field", children: [...] };
 *   const length = getLength(field); // e.g., 42
 *   ```;
 *
 * @param node - The HL7v2 AST node to measure
 * @param delimiters - The delimiters of the message, to count as HL7v2 §2.7.1
 *   does
 * @returns The total string length of the node content
 */
export function getLength(
  node?: Nodes | null | undefined,
  delimiters?: Delimiters
): number {
  if (!node) {
    return 0;
  }

  if ("value" in node) {
    if (delimiters === undefined) {
      return node.value.length;
    }
    return escapedLength(node.value, delimiters);
  }

  const nameLength = node.type === "segment" ? node.name.length : 0;

  return (
    nameLength +
    node.children.reduce(
      (total, child) => total + getLength(child, delimiters),
      0
    )
  );
}
