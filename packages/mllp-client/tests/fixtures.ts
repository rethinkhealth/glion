/**
 * HL7v2 messages and acknowledgments for the client tests. Every call
 * generates its own control ID.
 *
 * @module
 */

import { randomUUID } from "node:crypto";

import type { Root } from "@glion/ast";
import { parseHL7v2 } from "@glion/parser";

/**
 * An ADT^A01 admit message, with its MSH-10 and its parsed tree. `controlId`
 * defaults to a fresh one; pass `""` for a message without one.
 */
export function adtA01(options: { readonly controlId?: string } = {}): {
  readonly text: string;
  readonly tree: Root;
  readonly controlId: string;
} {
  const { controlId = randomUUID() } = options;
  const text = [
    `MSH|^~\\&|SENDER|FAC|RECV|RFAC|20241201120000||ADT^A01^ADT_A01|${controlId}|P|2.5`,
    "EVN|A01|20241201120000",
    "PID|1||12345^^^MRN||Doe^John||19800101|M",
  ].join("\r");

  return { controlId, text, tree: parseHL7v2(text) };
}

/**
 * An acknowledgment with MSA-1 `code`, answering `controlId`, with `msa3` in
 * MSA-3. Returns its own MSH-10 alongside its text; the two control IDs are
 * never equal.
 */
export function ack(
  code: string,
  options: {
    readonly controlId?: string;
    readonly msa3?: string;
    id?: string;
  } = {}
): { readonly text: string; readonly id: string; readonly controlId: string } {
  const { controlId = randomUUID(), msa3 = "", id: providedId } = options;
  const id = providedId ?? randomUUID();
  return {
    controlId,
    id,
    text: [
      `MSH|^~\\&|RECV|RFAC|SENDER|FAC|20241201120001||ACK^A01^ACK|${id}|P|2.5`,
      `MSA|${code}|${controlId}${msa3 === "" ? "" : `|${msa3}`}`,
    ].join("\r"),
  };
}

/** MSH-10 of an HL7v2 message, read from its text. */
export function controlIdOf(message: string): string {
  const msh = message.split("\r")[0] ?? "";
  return msh.split("|")[9] ?? "";
}
