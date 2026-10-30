// -------------
// Delimiters
// -------------

export const DEFAULT_DELIMITERS = {
  component: "^",
  escape: "\\",
  field: "|",
  repetition: "~",
  subcomponent: "&",
};

/**
 * The segment terminator, a carriage return. HL7v2 fixes it (Chapter 2: "The
 * segment terminator is always a carriage return"), so no message declares it.
 */
export const SEGMENT_TERMINATOR = "\r";
