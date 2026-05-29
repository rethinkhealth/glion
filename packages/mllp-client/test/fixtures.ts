/**
 * Test fixtures: HL7v2 ADT request + ACKs with each MSA-1 code.
 *
 * Control ID for the request is `MSG001`; ACKs echo it in MSA-2.
 */

export const REQUEST_CONTROL_ID = "MSG001";

export const REQUEST = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20241201120000||ADT^A01^ADT_A01|MSG001|P|2.5",
  "EVN|A01|20241201120000",
  "PID|1||12345^^^MRN||Doe^John||19800101|M",
].join("\r");

function ack(code: string, controlId = REQUEST_CONTROL_ID, text = ""): string {
  return [
    "MSH|^~\\&|RECV|RFAC|SENDER|FAC|20241201120001||ACK^A01^ACK|ACK001|P|2.5",
    `MSA|${code}|${controlId}${text === "" ? "" : `|${text}`}`,
  ].join("\r");
}

export const ACK_AA = ack("AA");
export const ACK_AE = ack("AE", REQUEST_CONTROL_ID, "Validation failed");
export const ACK_AR = ack("AR");
export const ACK_CA = ack("CA");
export const ACK_CE = ack("CE");
export const ACK_CR = ack("CR");

/** ACK that doesn't echo MSA-2 (empty controlId). Some peers do this. */
export const ACK_AA_EMPTY_CONTROL = [
  "MSH|^~\\&|RECV|RFAC|SENDER|FAC|20241201120001||ACK^A01^ACK|ACK002|P|2.5",
  "MSA|AA|",
].join("\r");

/** ACK whose MSA-2 doesn't match the request — correlation mismatch. */
export const ACK_AA_WRONG_CONTROL = ack("AA", "OTHER");

/** ACK with an MSA-1 value not in the standard six. */
export const ACK_UNKNOWN_CODE = [
  "MSH|^~\\&|RECV|RFAC|SENDER|FAC|20241201120001||ACK^A01^ACK|ACK003|P|2.5",
  `MSA|OK|${REQUEST_CONTROL_ID}`,
].join("\r");

/** ACK with no MSA segment at all — parse failure. */
export const ACK_NO_MSA = [
  "MSH|^~\\&|RECV|RFAC|SENDER|FAC|20241201120001||ACK^A01^ACK|ACK004|P|2.5",
].join("\r");

/** ACK where MSA-1 is present but empty. */
export const ACK_EMPTY_CODE = [
  "MSH|^~\\&|RECV|RFAC|SENDER|FAC|20241201120001||ACK^A01^ACK|ACK005|P|2.5",
  `MSA||${REQUEST_CONTROL_ID}`,
].join("\r");

/** ACK with an AE code and an ERR segment carrying diagnostic info. */
export const ACK_AE_WITH_ERR = [
  "MSH|^~\\&|RECV|RFAC|SENDER|FAC|20241201120001||ACK^A01^ACK|ACK006|P|2.5",
  "MSA|AE|MSG001|Required field missing",
  "ERR|||204^Required field missing^HL70357|E|||PID.5",
].join("\r");
