/**
 * Decoding: one unframed message to the acknowledgment it carries.
 *
 * Reads MSH-10, MSA-1, MSA-2, MSA-3, and the ERR segment. Correlation and the
 * meaning of a NAK are the caller's.
 *
 * @module
 */

import { isAckCode, isAckNakCode } from "@glion/ack";
import type { Root } from "@glion/ast";
import { parseHL7v2 } from "@glion/parser";
import { decodeBytes } from "@glion/util-charset";
import { value } from "@glion/util-query";

import type { Acknowledgment } from "./types";

/**
 * Reads one unframed message as the acknowledgment it carries.
 *
 * MSA-1 selects the returned shape. `AA` and `CA` return an
 * {@link Ack}; `AE`, `AR`, `CE`, and `CR` return an {@link AckNak},
 * which carries `errorCode`, `severity`, and an ERR-8 fallback for `text`.
 *
 * A NAK is a successful read. `controlId` is MSA-2 as found; correlation
 * against the message sent happens in the caller. MSH-9 and the HL7 version
 * are not checked (#668).
 *
 * @param bytes One unframed message: the payload of a single MLLP frame.
 * @returns The acknowledgment as found.
 * @throws {Error} MSA-1 is absent, or is not one of the six acknowledgment
 *   codes.
 * @throws The charset's and the parser's errors, unwrapped.
 */
export function decode(bytes: Uint8Array): Acknowledgment {
  const raw = decodeBytes(bytes);
  const tree = parseHL7v2(raw);

  const code = read(tree, "MSA-1[1].1.1");
  if (code === "") {
    throw new Error(
      "MSA-1 is empty, so accept or reject cannot be determined."
    );
  }
  if (!isAckCode(code)) {
    throw new Error(
      `MSA-1 is "${code}", which is not one of AA, AE, AR, CA, CE, or CR.`
    );
  }

  // The acknowledgment's own MSH-10, not the one it answers. Reported for
  // tracing; correlation must never use it.
  const id = read(tree, "MSH-10[1].1.1");

  // Reported, not required, for the same reason MSH-10 is on the way out:
  // an empty MSA-2 answers nothing, and only the caller knows what it sent.
  const controlId = read(tree, "MSA-2[1].1.1");

  const text = read(tree, "MSA-3[1].1.1") || undefined;
  if (isAckNakCode(code)) {
    return {
      code,
      controlId,
      errorCode: read(tree, "ERR-3[1].1.1") || undefined,
      id,
      raw,
      severity: read(tree, "ERR-4[1].1.1") || undefined,
      // ERR-8 only stands in for MSA-3 on a NAK: an ERR segment beside an
      // accept has nothing to describe.
      text: text ?? (read(tree, "ERR-8[1].1.1") || undefined),
      tree,
    };
  }
  return { code, controlId, id, raw, text, tree };
}

/** The value at `path`, or `""` when the field is absent. */
function read(tree: Root, path: string): string {
  return value(tree, path)?.value ?? "";
}
