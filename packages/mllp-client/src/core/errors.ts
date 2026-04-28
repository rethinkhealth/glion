import { MllpError } from "@glion/mllp-transport";
import type { MllpErrorOptions } from "@glion/mllp-transport";

/**
 * Machine-readable codes for `MllpClient` transport failures.
 *
 * These cover everything that can go wrong between the moment
 * `MllpClient.send()` is called and the moment a complete ACK frame
 * has been decoded — i.e. everything that is not an HL7v2
 * application-level NAK. NAK responses (MSA-1 ∈ {AE, AR, CE, CR})
 * surface as `AckException` subclasses thrown directly from
 * `@glion/ack`, not as transport errors.
 */
export const MllpClientErrorCode = {
  /**
   * The caller passed a payload that could not be MLLP-encoded —
   * typically because it was not a `string` or `Uint8Array`. Also
   * surfaced when constructor options fail validation (bad
   * host/port/timeout/etc). Thrown before any socket is opened, so
   * no connection is made and no resources need cleanup.
   */
  INVALID_INPUT: "INVALID_INPUT",
  /** TCP connection could not be established (refused, DNS, routing). */
  CONNECTION_REFUSED: "CONNECTION_REFUSED",
  /** The peer closed the connection before a complete ACK arrived. */
  CONNECTION_CLOSED: "CONNECTION_CLOSED",
  /** No ACK arrived within the configured `timeout`. */
  TIMEOUT: "TIMEOUT",
  /** The remote sent bytes that did not form a valid MLLP frame. */
  MALFORMED_FRAME: "MALFORMED_FRAME",
  /** A frame was received but could not be parsed as a valid HL7v2 ACK. */
  MALFORMED_ACK: "MALFORMED_ACK",
  /**
   * TLS handshake failed — typically because of certificate
   * verification, hostname mismatch, expired cert, untrusted CA, or
   * a TLS protocol error. Distinct from `CONNECTION_REFUSED` (the
   * TCP connection succeeded but the TLS upgrade failed) so
   * operators can identify TLS misconfiguration quickly in
   * healthcare deployments where it is a recurring incident class.
   */
  TLS_HANDSHAKE_FAILED: "TLS_HANDSHAKE_FAILED",
} as const;

export type MllpClientErrorCode =
  (typeof MllpClientErrorCode)[keyof typeof MllpClientErrorCode];

/**
 * Error thrown by `MllpClient.send()` for transport-level failures.
 *
 * Extends {@link MllpError} so callers can catch any MLLP error —
 * server- or client-side — with a single `instanceof MllpError`
 * check. The {@link MllpClientErrorCode | code} field discriminates
 * the failure mode for typed handling.
 *
 * Application-level NAK responses are **not** thrown as
 * `MllpClientError`; they are thrown as `AckException` subclasses
 * from `@glion/ack`. A typical `catch` block handles both:
 *
 * ```ts
 * import { AckException } from "@glion/ack";
 * import { MllpClientError } from "@glion/mllp-client";
 *
 * try {
 *   await client.send(message);
 * } catch (error) {
 *   if (error instanceof AckException) {
 *     // Application-level NAK.
 *   } else if (error instanceof MllpClientError) {
 *     // Transport-level failure.
 *   }
 * }
 * ```
 */
export class MllpClientError extends MllpError {
  /**
   * Narrowed view of the inherited `MllpError.code` field. `declare`
   * keeps the runtime value (set by the base constructor) while
   * exposing the discriminated {@link MllpClientErrorCode} union to
   * TypeScript — callers can `switch` on `error.code` with full
   * exhaustiveness checking.
   */
  declare readonly code: MllpClientErrorCode;

  constructor(
    code: MllpClientErrorCode,
    message: string,
    options?: MllpErrorOptions
  ) {
    super(code, message, options);
    this.name = "MllpClientError";
  }
}
