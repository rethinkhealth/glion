import type { Root, Segment } from "@glion/ast";
import { m } from "@glion/builder";
import { parseHL7v2 } from "@glion/parser";
import { CharsetError, decodeBytes } from "@glion/util-charset";
import { DEFAULT_DELIMITERS } from "@glion/utils";
import { VFile } from "vfile";

import type { Hl7v2Processor } from "./types";

/** A request: the message the server read from one MLLP frame payload. */
export interface MllpRequest {
  /** The payload decoded as UTF-8. */
  readonly raw: string;
  /** The file the processor parsed, holding `raw`. */
  readonly file: VFile;
  /** The processor's tree. */
  readonly tree: Root;
}

/**
 * Decodes `payload` as UTF-8 and parses it with `processor`.
 *
 * @throws {CharsetError} When `payload` is not UTF-8.
 * @throws What the processor's parser throws.
 */
export function parseRequest(
  payload: Uint8Array,
  processor: Hl7v2Processor
): MllpRequest {
  const raw = decodeBytes(payload);
  const file = new VFile(raw);
  const tree = processor.parse(file);
  return { file, raw, tree };
}

/**
 * The MSH `payload` starts with, salvaged alone in a tree by `@glion/parser`
 * from the bytes before the first `delimiter`, the segment terminator;
 * `undefined` when those bytes are not UTF-8 or are not an MSH. Best effort:
 * the rest of `payload` is not read.
 */
export function salvageHeader(
  payload: Uint8Array,
  delimiter = DEFAULT_DELIMITERS.segment
): Root | undefined {
  const end = payload.findIndex(
    (byte) => String.fromCodePoint(byte) === delimiter
  );
  let text: string;
  try {
    text = decodeBytes(end === -1 ? payload : payload.subarray(0, end));
  } catch (error) {
    // An MSH that is not UTF-8 cannot be echoed as the sender wrote it.
    if (error instanceof CharsetError) {
      return undefined;
    }
    throw error;
  }
  const header = messageHeader(parseHL7v2(text));
  return header && m(header);
}

/** The MSH segment `tree` starts with, or `undefined` when it starts with none. */
export function messageHeader(tree: Root): Segment | undefined {
  const [first] = tree.children;
  return first?.type === "segment" && first.name === "MSH" ? first : undefined;
}
