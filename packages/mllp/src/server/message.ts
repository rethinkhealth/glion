import type { Root } from "@glion/ast";
import { m, s } from "@glion/builder";
import { parseHL7v2 } from "@glion/parser";
import { decodeBytes } from "@glion/util-charset";
import { VFile } from "vfile";

import { MllpServerError, MllpServerErrorCode } from "../errors";
import { copyField } from "./acknowledge";
import type { Hl7v2Processor } from "./types";

/** Decodes UTF-8, with U+FFFD for each byte that is not UTF-8. */
const LENIENT_DECODER = new TextDecoder();

/** A message as the server read it from one MLLP frame payload. */
export interface ReceivedMessage {
  /** The MLLP frame payload. */
  readonly bytes: Uint8Array;
  /** The payload decoded as UTF-8. Empty when the payload is not UTF-8. */
  readonly raw: string;
  /** The file the processor parsed, holding `raw`. */
  readonly file: VFile;
  /** The processor's tree. Empty when the payload did not decode or parse. */
  readonly tree: Root;
  /**
   * A copy of the MSH the payload starts with, values only, in a tree of its
   * own; a tree with no segment when the payload starts with none. Changes
   * to `tree` do not reach it.
   */
  readonly header: Root;
  /**
   * Why the payload was not read: `MllpServerError` `INCOMPATIBLE_CHARSET`,
   * or what the processor's parser threw. `undefined` when it was read.
   */
  readonly error: Error | undefined;
}

/**
 * Reads `payload`: decodes it as UTF-8 and parses it with `processor`.
 *
 * A payload that does not decode or parse still has a `header`: it is read
 * by `@glion/parser` from the payload decoded with U+FFFD for each byte that
 * is not UTF-8. Never throws.
 */
export function readMessage(
  payload: Uint8Array,
  processor: Hl7v2Processor
): ReceivedMessage {
  let raw: string;
  try {
    raw = decodeBytes(payload);
  } catch (error) {
    return {
      bytes: payload,
      error: new MllpServerError(MllpServerErrorCode.INCOMPATIBLE_CHARSET, {
        cause: error,
      }),
      file: new VFile(""),
      header: headerOf(parseHL7v2(LENIENT_DECODER.decode(payload))),
      raw: "",
      tree: m(),
    };
  }

  const file = new VFile(raw);
  try {
    const tree = processor.parse(file);
    return {
      bytes: payload,
      error: undefined,
      file,
      header: headerOf(tree),
      raw,
      tree,
    };
  } catch (error) {
    return {
      bytes: payload,
      error: error instanceof Error ? error : new Error(String(error)),
      file,
      header: headerOf(parseHL7v2(raw)),
      raw,
      tree: m(),
    };
  }
}

/** A tree holding a copy of the MSH `tree` starts with, values only. */
function headerOf(tree: Root): Root {
  const [first] = tree.children;
  return first?.type === "segment" && first.name === "MSH"
    ? m(s("MSH", ...first.children.map(copyField)))
    : m();
}
