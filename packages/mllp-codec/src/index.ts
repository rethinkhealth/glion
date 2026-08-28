/**
 * MLLP byte-level framing primitives for HL7v2 messaging.
 *
 * Implements MLLP Release 1 (HL7v2 Transport Specification §2.3.1):
 * each message is wrapped in `<VT> payload <FS> <CR>`. MLLP Release 2
 * (commit acknowledgements) and HL7-over-HTTP are out of scope.
 *
 * Public surface:
 *
 * - {@link frame} — wrap a payload in the MLLP envelope (one-shot encoder).
 * - {@link unframe} — its inbound counterpart: a `TransformStream` turning wire
 *   bytes into complete payloads.
 * - {@link MllpCodecError} + {@link MllpCodecErrorCode} — typed failures.
 * - {@link VT}, {@link FS}, {@link CR} — the framing byte constants.
 *
 * @module
 */

export { CR, FS, VT } from "./constants";
export { MllpCodecError, MllpCodecErrorCode } from "./errors";
export { frame } from "./frame";
export { unframe } from "./unframe";
export type { UnframeOptions } from "./unframe";
