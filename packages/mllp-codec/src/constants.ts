/**
 * The MLLP framing byte constants (HL7v2 Transport Specification §2.3.1).
 *
 * @module
 */

/** Start-of-block marker. HL7v2 §2.3.1 calls this `<SB>` (Vertical Tab, 0x0B). */
export const VT = 0x0b;
/** End-of-block marker. HL7v2 §2.3.1 calls this `<EB>` (File Separator, 0x1C). */
export const FS = 0x1c;
/**
 * End-of-data marker (Carriage Return, 0x0D). Always follows FS to
 * terminate a frame. CR may also appear inside a payload — HL7v2
 * uses it as the segment terminator.
 */
export const CR = 0x0d;
