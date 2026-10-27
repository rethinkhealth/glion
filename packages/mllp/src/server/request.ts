import type { Root, Segment } from "@glion/ast";
import { m } from "@glion/builder";
import { parseHL7v2 } from "@glion/parser";
import { CharsetError, decodeBytes } from "@glion/util-charset";
import { VFile } from "vfile";

import { MllpServerError, MllpServerErrorCode } from "../errors";
import type { Hl7v2Processor } from "./types";

/** CR, the byte that ends each segment. */
const SEGMENT_TERMINATOR = 0x0d;

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
 * @throws {MllpServerError} `INCOMPATIBLE_CHARSET` when `payload` is not
 * UTF-8.
 * @throws What the processor's parser throws.
 */
export function parseRequest(
  payload: Uint8Array,
  processor: Hl7v2Processor
): MllpRequest {
  let raw: string;
  try {
    raw = decodeBytes(payload);
  } catch (error) {
    throw new MllpServerError(MllpServerErrorCode.INCOMPATIBLE_CHARSET, {
      cause: error,
    });
  }
  const file = new VFile(raw);
  return { file, raw, tree: processor.parse(file) };
}

/**
 * The MSH `payload` starts with, alone in a tree, read by `@glion/parser`
 * from the bytes before the first CR; `undefined` when those bytes are not
 * UTF-8 or are not an MSH.
 */
export function readHeader(payload: Uint8Array): Root | undefined {
  const end = payload.indexOf(SEGMENT_TERMINATOR);
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
