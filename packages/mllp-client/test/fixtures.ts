/**
 * Test fixtures: HL7v2 messages as functions, so every message gets its own
 * control ID. An acknowledgment for one message can then never pass as the
 * acknowledgment of another, which is what the client's correlation check
 * has to catch.
 */

import { randomUUID } from "node:crypto";

/**
 * An ADT^A01 admit message. `controlId` defaults to a fresh one; pass `""`
 * for a message with no MSH-10.
 */
export function adtA01(controlId: string = randomUUID()): string {
  return [
    `MSH|^~\\&|SENDER|FAC|RECV|RFAC|20241201120000||ADT^A01^ADT_A01|${controlId}|P|2.5`,
    "EVN|A01|20241201120000",
    "PID|1||12345^^^MRN||Doe^John||19800101|M",
  ].join("\r");
}

/**
 * An acknowledgment with MSA-1 `code` for the message with `controlId`.
 * `text` fills MSA-3, the remote system's own diagnostic.
 */
export function ack(code: string, controlId: string, text = ""): string {
  return [
    "MSH|^~\\&|RECV|RFAC|SENDER|FAC|20241201120001||ACK^A01^ACK|ACK001|P|2.5",
    `MSA|${code}|${controlId}${text === "" ? "" : `|${text}`}`,
  ].join("\r");
}

/** MSH-10 of an HL7v2 message, read from its text. */
export function controlIdOf(message: string): string {
  const msh = message.split("\r")[0] ?? "";
  return msh.split("|")[9] ?? "";
}
