/**
 * Shared HL7v2 message and ACK fixtures used across the per-runtime
 * test suites. Centralising these constants here keeps the test
 * scaffolding identical across `core.test.ts`, `node.test.ts`,
 * `deno.test.ts`, and `workers.test.ts` — a fixture change in one
 * place covers every adapter.
 */

/** Sample ADT^A01 message used as the outbound payload in tests. */
export const SAMPLE_ADT = [
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1",
  "EVN|A01|20240101120000",
  "PID|1||12345^^^MRN||Doe^John",
].join("\r");

/** Successful AA acknowledgment payload (no MLLP framing). */
export const VALID_AA =
  "MSH|^~\\&|R|F|S|F|20240101120000||ACK|MSG001|P|2.5.1\rMSA|AA|MSG001";

/** Application-error AE acknowledgment with ERR-3=204, ERR-4=E. */
export const VALID_AE =
  "MSH|^~\\&|R|F|S|F|20240101120000||ACK|MSG001|P|2.5.1\rMSA|AE|MSG001|Validation failed\rERR|||204|E";

/**
 * Commit-accept (CA) acknowledgment used in HL7v2 enhanced mode. The
 * receiver follows up with a separate final ACK after processing.
 */
export const VALID_CA =
  "MSH|^~\\&|R|F|S|F|20240101120000||ACK|MSG001|P|2.5.1\rMSA|CA|MSG001";

/** MLLP frame start byte (VT). */
export const MLLP_VT = 0x0b;
/** MLLP frame end byte 1 (FS). */
export const MLLP_FS = 0x1c;
/** MLLP frame end byte 2 (CR). */
export const MLLP_CR = 0x0d;

/**
 * Wrap a payload in an MLLP frame: `<VT> payload <FS><CR>`. Used by
 * tests that need to feed pre-framed bytes into a fake duplex or a
 * raw TCP server.
 */
export function frame(payload: string): Uint8Array {
  const inner = new TextEncoder().encode(payload);
  const out = new Uint8Array(inner.length + 3);
  out[0] = MLLP_VT;
  out.set(inner, 1);
  out[out.length - 2] = MLLP_FS;
  out[out.length - 1] = MLLP_CR;
  return out;
}
