/**
 * HL7v2 acknowledgment codes (MSA-1).
 *
 * @module
 */

/**
 * HL7v2 acknowledgment codes (MSA-1).
 *
 * - `AA` / `CA` — accept (application / commit).
 * - `AE` / `CE` — error (application / commit).
 * - `AR` / `CR` — reject (application / commit).
 *
 * `MllpClient.send()` resolves with `code` narrowed to {@link AcceptCode}
 * and throws {@link MllpRejectedError} with `code` narrowed to
 * {@link NakCode}.
 */
export const AckCode = {
  AA: "AA",
  AE: "AE",
  AR: "AR",
  CA: "CA",
  CE: "CE",
  CR: "CR",
} as const;
export type AckCode = (typeof AckCode)[keyof typeof AckCode];
export type AcceptCode = "AA" | "CA";
export type NakCode = "AE" | "AR" | "CE" | "CR";

export function isAckCode(s: string): s is AckCode {
  return (
    s === "AA" ||
    s === "AE" ||
    s === "AR" ||
    s === "CA" ||
    s === "CE" ||
    s === "CR"
  );
}
