/**
 * The codec: HL7v2 trees to MLLP frames, and received frames to the
 * acknowledgments they carry.
 *
 * This is the codec's surface. Callers import from here, not from the files
 * behind it — how encoding and decoding are split up is the codec's business.
 *
 * @module
 */

export { decode } from "./decode";
export { encode } from "./encode";
export type { Ack, Acknowledgment, AckNak } from "./types";
