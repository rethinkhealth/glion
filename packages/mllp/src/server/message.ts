import type { Root, Segment } from "@glion/ast";
import { m } from "@glion/builder";
import { parseHL7v2 } from "@glion/parser";
import { decodeBytes } from "@glion/util-charset";
import { VFile } from "vfile";

import { MllpServerError, MllpServerErrorCode } from "../errors";
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
  /**
   * The processor's tree. When the payload did not decode or parse, only the
   * MSH it starts with, or no segment when it starts with none.
   */
  readonly tree: Root;
  /**
   * Why the payload was not read: `MllpServerError` `INCOMPATIBLE_CHARSET`,
   * or what the processor's parser threw. `undefined` when it was read.
   */
  readonly error: Error | undefined;
}

/**
 * Reads `payload`: decodes it as UTF-8 and parses it with `processor`.
 *
 * The MSH of a payload that does not decode or parse is read by
 * `@glion/parser` from the payload decoded with U+FFFD for each byte that is
 * not UTF-8. Never throws for a payload of bytes.
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
      raw: "",
      tree: headerOnly(parseHL7v2(LENIENT_DECODER.decode(payload))),
    };
  }

  const file = new VFile(raw);
  try {
    const tree = processor.parse(file);
    return {
      bytes: payload,
      error: undefined,
      file,
      raw,
      tree,
    };
  } catch (error) {
    return {
      bytes: payload,
      error: error instanceof Error ? error : new Error(String(error)),
      file,
      raw,
      tree: headerOnly(parseHL7v2(raw)),
    };
  }
}

/** The MSH segment `tree` starts with, or `undefined` when it starts with none. */
export function messageHeader(tree: Root): Segment | undefined {
  const [first] = tree.children;
  return first?.type === "segment" && first.name === "MSH" ? first : undefined;
}

/** `tree` with only the MSH it starts with, or no segment. */
function headerOnly(tree: Root): Root {
  const header = messageHeader(tree);
  return header ? m(header) : m();
}
