/**
 * The outbound half of the frame/unframe pair: wrap one HL7v2 message in the
 * MLLP envelope.
 *
 * @module
 */

import { CR, FS, VT } from "./constants";
import { MllpCodecError, MllpCodecErrorCode } from "./errors";

/**
 * Wrap one HL7v2 message in the MLLP envelope: a fresh `Uint8Array` of
 * `<VT> payload <FS> <CR>`. One allocation, one write call at the socket;
 * no shared mutable state.
 *
 * Takes encoded message BYTES, not text. This codec is content-opaque — it
 * cannot read the message's MSH-18 character-set declaration, so it must
 * not choose an encoding either. Encode upstream, where MSH-18 is visible
 * (`@glion/util-charset`'s `encodeBytes`), and pass the result here.
 *
 * An MLLP message by definition contains no VT or FS — MLLP reserves those
 * as message-boundary markers — so `frame` will not construct an invalid
 * frame: a message carrying either byte throws here, at the source, instead
 * of desynchronising the receiver (the same boundary rule `unframe`
 * enforces on the way in, and the injection defence for messages carrying
 * caller-controlled content). CR is allowed — HL7v2 uses it as the segment
 * terminator. This check is also what refuses UTF-16 content: its code
 * units legitimately contain the reserved byte values, so MLLP itself
 * cannot carry it — re-encode upstream.
 *
 * @throws {@link MllpCodecError} With code `RESERVED_CHARACTER`.
 */
export function frame(payload: Uint8Array): Uint8Array {
  // Two indexOf passes — measured parity with a single per-byte loop on V8;
  // kept for brevity. The reported offset is the first reserved byte of
  // either kind, exactly as a left-to-right scan would find it.
  const vtAt = payload.indexOf(VT);
  const fsAt = payload.indexOf(FS);
  // Reduce the two hits to the earliest offense. `indexOf` answers -1 for
  // "absent", so: start from the VT hit, then switch to the FS hit either
  // when there was no VT at all (`at === -1`) or when FS occurs earlier.
  // `at` ends up -1 exactly when the payload contains neither reserved
  // byte — the valid-message case that falls through to framing below.
  let at = vtAt;
  if (at === -1 || (fsAt !== -1 && fsAt < at)) {
    at = fsAt;
  }
  if (at !== -1) {
    // `at` came from indexOf, so it is definitionally in range — the cast
    // only silences noUncheckedIndexedAccess. The error names the exact
    // byte and offset so the offense can be located in the source message
    // without a hex dump.
    const b = payload[at] as number;
    throw new MllpCodecError(
      MllpCodecErrorCode.RESERVED_CHARACTER,
      `Message contains the MLLP reserved character 0x${b.toString(16).padStart(2, "0")} at offset ${at}; a message must not contain VT (0x0B) or FS (0x1C)`
    );
  }
  const out = new Uint8Array(payload.length + 3);
  out[0] = VT;
  out.set(payload, 1);
  out[payload.length + 1] = FS;
  out[payload.length + 2] = CR;
  return out;
}
