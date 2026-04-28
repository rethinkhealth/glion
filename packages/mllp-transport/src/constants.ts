// -------------
// MLLP Frame Bytes
// -------------

/**
 * MLLP Start Byte - Vertical Tab (VT)
 * Marks the beginning of an MLLP frame
 */
export const MLLP_START_BYTE = 0x0b;

/**
 * MLLP End Byte 1 - File Separator (FS)
 * First byte of the end sequence
 */
export const MLLP_END_BYTE_1 = 0x1c;

/**
 * MLLP End Byte 2 - Carriage Return (CR)
 * Second byte of the end sequence
 */
export const MLLP_END_BYTE_2 = 0x0d;

// -------------
// Pre-computed Uint8Arrays for efficiency
// -------------

/**
 * MLLP header as a Uint8Array containing the start byte
 */
export const MLLP_HEADER = new Uint8Array([MLLP_START_BYTE]);

/**
 * MLLP trailer as a Uint8Array containing the end sequence
 */
export const MLLP_TRAILER = new Uint8Array([MLLP_END_BYTE_1, MLLP_END_BYTE_2]);
