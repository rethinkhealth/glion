/**
 * Test fixtures: HL7v2 messages as functions, so every message gets its own
 * control ID. An acknowledgment for one message can then never pass as the
 * acknowledgment of another, which is what the client's correlation check
 * has to catch.
 */

import type { Root } from "@glion/ast";
import { parseHL7v2 } from "@glion/parser";

/**
 * An ADT^A01 admit message.
 *
 * Returns its MSH-10 and its parsed tree alongside its text, so a test asserts
 * against what the fixture generated and hands `tree` straight to `send()`.
 * `controlId` defaults to a fresh one; pass `""` for a message without one.
 */
export function adtA01(options: { readonly controlId?: string } = {}): {
  readonly text: string;
  readonly tree: Root;
  readonly controlId: string;
} {
  const { controlId = crypto.randomUUID() } = options;
  const text = [
    `MSH|^~\\&|SENDER|FAC|RECV|RFAC|20241201120000||ADT^A01^ADT_A01|${controlId}|P|2.5`,
    "EVN|A01|20241201120000",
    "PID|1||12345^^^MRN||Doe^John||19800101|M",
  ].join("\r");

  return { controlId, text, tree: parseHL7v2(text) };
}

/**
 * An acknowledgment with MSA-1 `code`, answering `controlId` and carrying
 * `msa3` in MSA-3. Both default: a test that does not assert on them says
 * nothing about them.
 *
 * Returns the acknowledgment's own MSH-10 alongside its text. Both control IDs
 * are generated per call and never equal, so a test cannot pass by confusing
 * the two, and cannot go stale against a hardcoded literal.
 */
export function ack(
  code: string,
  options: {
    readonly controlId?: string;
    readonly msa3?: string;
    id?: string;
  } = {}
): { readonly text: string; readonly id: string; readonly controlId: string } {
  const {
    controlId = crypto.randomUUID(),
    msa3 = "",
    id: providedId,
  } = options;
  const id = providedId ?? crypto.randomUUID();
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
