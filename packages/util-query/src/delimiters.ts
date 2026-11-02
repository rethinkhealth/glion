import type { Delimiters, Group, Root, Segment } from "@glion/ast";
import { DEFAULT_DELIMITERS, ENCODING_CHARACTERS } from "@glion/utils";

const firstSegment = (parent: Root | Group): Segment | undefined => {
  for (const child of parent.children) {
    if (child.type === "group") {
      const segment = firstSegment(child);
      if (segment) {
        return segment;
      }
    } else if (
      child.type === "segment" &&
      (child.name !== "" || child.children.length > 0)
    ) {
      return child;
    }
  }
  return undefined;
};

/**
 * The message header segment `root` opens with, after any empty lines, or
 * `undefined` when it opens with another segment.
 *
 * @param root - The message, or the segment group, to read.
 * @returns The message header segment.
 */
export function header(root: Root | Group): Segment | undefined {
  const first = firstSegment(root);
  return first?.name === "MSH" ? first : undefined;
}

/**
 * The delimiters of `root`, as `@glion/parser` reads a message with them.
 *
 * MSH-1 is the field separator, and MSH-2's encoding characters are the
 * component separator, repetition separator, escape character, and subcomponent
 * separator, in that order: `MSH|^~\&` declares all five. A delimiter MSH-2 is
 * too short to declare is absent: `^~&` declares no subcomponent separator. The
 * field separator is `|` when MSH-1 is not one character. A message that does
 * not open with a message header segment that has fields, as
 * {@link header} reads it, has the delimiters `fallback`, over
 * `DEFAULT_DELIMITERS`.
 *
 * @param root - The message to read.
 * @param fallback - The delimiters of a message without a message header.
 * @returns The delimiters.
 */
export function delimiters(
  root: Root,
  fallback?: Partial<Delimiters>
): Delimiters {
  const msh = header(root);
  if (!msh?.children.length) {
    return { ...DEFAULT_DELIMITERS, ...fallback };
  }

  const [msh1, msh2] = msh.children.map(
    (field) => field.children[0]?.children[0]?.children[0]?.value
  );
  const result: Delimiters = {
    field: msh1?.length === 1 ? msh1 : DEFAULT_DELIMITERS.field,
  };

  for (const [i, key] of ENCODING_CHARACTERS.entries()) {
    const ch = msh2?.charAt(i);
    if (ch) {
      result[key] = ch;
    }
  }

  return result;
}
