import type { Root, Segment } from "@glion/ast";
import { m } from "@glion/builder";
import { parseHL7v2 } from "@glion/parser";
import { CharsetError, decodeBytes } from "@glion/util-charset";
import { value } from "@glion/util-query";
import { DEFAULT_DELIMITERS } from "@glion/utils";
import { VFile } from "vfile";

import type { Hl7v2Processor } from "./types";

/** A request: the message the server read from one MLLP frame payload. */
export interface MllpRequest {
  /** The payload decoded as UTF-8. */
  readonly raw: string;
  /** The file the processor parsed, holding `raw`, with its messages. */
  readonly file: VFile;
  /** The tree the processor parsed and ran its transformers on. */
  readonly tree: Root;
  /**
   * The MSH fields that control processing, read from `tree` before routing.
   * Changes a handler makes to `tree` do not change them.
   */
  readonly header: MessageHeader;
  /**
   * The processor's compiled result (e.g., JSON from hl7v2Jsonify), or
   * `undefined` when the processor has no compiler. Runs `stringify()` on
   * first call, and is cached.
   */
  result(): Promise<unknown>;
}

/** The MSH fields that control processing. An absent field is an empty string. */
export interface MessageHeader {
  /** MSH-9.1, the message code (e.g., `ADT`). */
  readonly messageCode: string;
  /** MSH-9.2, the trigger event (e.g., `A01`). */
  readonly triggerEvent: string;
  /** MSH-9.3, the message structure (e.g., `ADT_A01`). */
  readonly messageStructure: string;
  /** MSH-10, the message control ID, which MSA-2 echoes. */
  readonly controlId: string;
  /** MSH-11.1, the processing ID (HL7v2 Table 0103: `P`, `T` or `D`). */
  readonly processingId: string;
  /** MSH-12.1, the version ID (e.g., `2.5.1`). */
  readonly version: string;
  /**
   * MSH-15, the accept acknowledgment type (HL7v2 Table 0155: `AL`, `NE`, `ER`
   * or `SU`).
   */
  readonly acceptAckType: string;
  /** MSH-16, the application acknowledgment type (HL7v2 Table 0155). */
  readonly applicationAckType: string;
}

/**
 * Decodes `payload` as UTF-8, parses it with `processor`, and runs the
 * processor's transformers on the tree.
 *
 * @throws {CharsetError} When `payload` is not UTF-8.
 * @throws What the processor's parser or transformers throw.
 */
export async function parseRequest(
  payload: Uint8Array,
  processor: Hl7v2Processor
): Promise<MllpRequest> {
  const raw = decodeBytes(payload);
  const file = new VFile(raw);
  const parsed = processor.parse(file);
  // Hl7v2Processor's tail admits `undefined` (so the bare parser is
  // assignable), which makes unified type run()'s result as `Root | Node`;
  // an HL7v2 pipeline always yields a Root.
  const tree = (await processor.run(parsed, file)) as Root;
  const field = (path: string): string => value(tree, path)?.value ?? "";
  const header: MessageHeader = {
    acceptAckType: field("MSH.15"),
    applicationAckType: field("MSH.16"),
    controlId: field("MSH.10"),
    messageCode: field("MSH.9.1"),
    messageStructure: field("MSH.9.3"),
    processingId: field("MSH.11.1"),
    triggerEvent: field("MSH.9.2"),
    version: field("MSH.12.1"),
  };
  let compiled: { value: unknown } | undefined;
  const result = (): Promise<unknown> => {
    compiled ??= {
      value: processor.compiler ? processor.stringify(tree, file) : undefined,
    };
    return Promise.resolve(compiled.value);
  };
  return { file, header, raw, result, tree };
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
