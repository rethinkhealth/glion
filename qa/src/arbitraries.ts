/**
 * Fast-check arbitraries for generating structurally valid HL7v2 messages.
 *
 * ## What is property-based testing (PBT)?
 *
 * Instead of writing test cases by hand ("given this input, expect that
 * output"), PBT generates hundreds of random inputs and checks that a
 * **property** holds for every one of them. For example: "the parser never
 * throws, no matter what string you feed it."
 *
 * The core building block is an **Arbitrary** — a generator that knows how to
 * produce random values of a specific type. fast-check provides primitives like
 * `fc.string()` and `fc.integer()`, and you compose them into domain-specific
 * generators (like "a valid HL7v2 message").
 *
 * ## How this file is organized
 *
 * HL7v2 messages have a nested delimiter structure. We build arbitraries
 * bottom-up, mirroring the HL7v2 hierarchy:
 *
 *     Message      = MSH segment + 0..n additional segments, joined by \r
 *     Segment      = NAME | field | field | ...     (segments can repeat in groups)
 *     Field        = repetition [~ repetition ...]  (~ = repetition delimiter; may be empty or single)
 *     Repetition   = component [^ component ...]    (^ = component delimiter; may be single)
 *     Component    = subcomponent [& subcomponent ...] (& = subcomponent delimiter; may be single)
 *     Subcomponent = plain text (no delimiters)      (may be empty string)
 *
 * At every level, values can be **empty** — an empty field, empty component,
 * or empty subcomponent are all valid in HL7v2 and represented as zero-length
 * strings between delimiters (e.g., `||` for an empty field, `^^` for empty
 * components). Fields can also have no repetitions (just a single value with
 * no `~`), and segments can repeat within a message (e.g., multiple OBX
 * segments for lab results).
 *
 * Each level is a function that takes the delimiter set and returns an
 * `fc.Arbitrary<string>` — a generator of random strings at that level.
 *
 * ## Key fast-check concepts used here
 *
 * - **`fc.string({ unit, minLength, maxLength })`** — generate a string whose
 *   characters come from the `unit` arbitrary.
 * - **`fc.array(arb, { minLength, maxLength })`** — generate an array of values
 *   from `arb`, then `.map()` to join them with a delimiter.
 * - **`fc.tuple(a, b)`** — generate a pair `[valueFromA, valueFromB]`.
 * - **`.map(fn)`** — transform a generated value (e.g., join array → string).
 * - **`.filter(fn)`** — reject values that don't meet a condition (use sparingly
 *   — too many rejections slow generation down).
 * - **`.chain(fn)`** — generate a value, then use it to build a _new_ arbitrary.
 *   This is how `arbMutatedMessage` first generates a valid message and then
 *   randomly corrupts it.
 * - **`fc.oneof(...arbs)`** — pick one of several arbitraries at random.
 */
import type { EventSchema, EventSchemaElement } from "@glion/profiles";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Delimiter sets
// ---------------------------------------------------------------------------

/**
 * The standard HL7v2 encoding characters.
 *
 * In a real message these are declared in the MSH segment header:
 *
 * - MSH-1 (field separator): `|`
 * - MSH-2 (encoding characters): `^~\&` (component, repetition, escape,
 *   subcomponent)
 * - Segment terminator: `\r` (carriage return)
 *
 * These defaults match the HL7v2 spec and are used by ~99% of real messages.
 */
const DEFAULT_ENCODING_CHARS = {
  component: "^",
  escape: "\\",
  field: "|",
  repetition: "~",
  segment: "\r",
  subcomponent: "&",
};

/**
 * Generate a random set of HL7v2 encoding characters.
 *
 * The HL7v2 spec allows any printable ASCII character as a delimiter, as long
 * as all 5 delimiter characters are distinct. This arbitrary picks 5 random
 * characters from a pool of punctuation to exercise the parser's delimiter
 * detection logic beyond the standard `|^~\&`.
 *
 * **How it works:** `fc.shuffledSubarray` picks exactly 5 characters from
 * the pool in random order, then we assign each to a delimiter role.
 *
 * @example
 *   // Might generate: { field: "#", component: "!", repetition: "@", escape: "%", subcomponent: "*" }
 */
export const arbEncodingChars = fc
  .shuffledSubarray([..."!@#$%^&*()-_=+[]{}|\\;:',.<>?/~`"], {
    maxLength: 5,
    minLength: 5,
  })
  .map(([field, component, repetition, escape, subcomponent]) => ({
    component: component as string,
    escape: escape as string,
    field: field as string,
    repetition: repetition as string,
    segment: "\r",
    subcomponent: subcomponent as string,
  }));

// ---------------------------------------------------------------------------
// Value generators (the leaf nodes of the HL7v2 hierarchy)
// ---------------------------------------------------------------------------

/**
 * Generate a random printable ASCII string safe to use as an HL7v2 field value.
 *
 * The generated string will never contain any of the delimiter characters,
 * because those would be interpreted as structural boundaries by the parser.
 * Think of this as the "plain text" content inside a subcomponent.
 *
 * **How it works:** We generate characters in the printable ASCII range
 * (0x20–0x7E, i.e. space through tilde) and filter out any that match the
 * current delimiter set. The `unit` option tells `fc.string()` to use our
 * custom character generator instead of the default.
 *
 * @example
 *   // With default delimiters, might generate: "JOHN", "20250101", "", "Dr"
 *   // Will never generate strings containing | ^ ~ \ & \r
 *
 * @param delimiters - The delimiter set to avoid. This is a parameter (not
 *   hardcoded) because custom-delimiter tests use non-standard characters.
 */
function arbFieldValue(
  delimiters: typeof DEFAULT_ENCODING_CHARS
): fc.Arbitrary<string> {
  const forbidden = new Set([
    delimiters.field,
    delimiters.component,
    delimiters.repetition,
    delimiters.escape,
    delimiters.subcomponent,
    delimiters.segment,
    "\n",
  ]);

  return fc.string({
    maxLength: 20,
    minLength: 0,
    unit: fc
      .integer({ max: 0x7e, min: 0x20 })
      .map((code) => String.fromCodePoint(code))
      .filter((ch) => !forbidden.has(ch)),
  });
}

/**
 * Generate a 3-letter uppercase segment name (e.g., "PID", "OBX", "EVN").
 *
 * HL7v2 segment names are always exactly 3 uppercase ASCII letters.
 * We exclude "MSH" because the MSH segment has special structural rules
 * (it declares the delimiters) and is always generated separately.
 *
 * @example
 *   // Might generate: "PID", "OBR", "ZQK" (Z-segments are valid custom extensions)
 */
export const arbSegmentName: fc.Arbitrary<string> = fc
  .string({
    maxLength: 3,
    minLength: 3,
    unit: fc
      .integer({ max: 90, min: 65 })
      .map((code) => String.fromCodePoint(code)),
  })
  .filter((name) => name !== "MSH"); // MSH is handled specially

// ---------------------------------------------------------------------------
// Structural generators
//
// These mirror the HL7v2 hierarchy, building from the bottom up.
// Each function takes the delimiter set so the same composition logic
// works for both default and custom delimiters.
//
// HL7v2 hierarchy (bottom to top):
//   Subcomponent → Component → FieldRepetition → Field → Segment → Message
//
// Example with default delimiters:
//   Subcomponent:    "JOHN"
//   Component:       "JOHN&JR"        (& joins subcomponents)
//   FieldRepetition: "JOHN&JR^DOE"    (^ joins components)
//   Field:           "JOHN&JR^DOE~JANE^DOE"  (~ joins repetitions)
//   Segment:         "PID|1|JOHN&JR^DOE~JANE^DOE|..."  (| joins fields)
//   Message:         "MSH|^~\&|...\rPID|1|..."  (\r joins segments)
// ---------------------------------------------------------------------------

/**
 * Generate a single subcomponent value.
 *
 * A subcomponent is the smallest unit of data in HL7v2 — just plain text.
 * This is a thin wrapper around {@link arbFieldValue} for clarity.
 *
 * @example
 *   "JOHN", "20250101", "" (empty is valid)
 */
function arbSubcomponent(
  delimiters: typeof DEFAULT_ENCODING_CHARS
): fc.Arbitrary<string> {
  return arbFieldValue(delimiters);
}

/**
 * Generate a component: 1–3 subcomponents joined by the subcomponent delimiter.
 *
 * In HL7v2, components are the parts of a field separated by `^`, and each
 * component can itself contain subcomponents separated by `&`.
 *
 * **How it works:** Generate an array of 1–3 subcomponent strings, then
 * `.map()` to join them with the `&` delimiter.
 *
 * @example
 *   "JOHN&JR" (two subcomponents), "DOE" (one subcomponent)
 */
function arbComponent(
  delimiters: typeof DEFAULT_ENCODING_CHARS
): fc.Arbitrary<string> {
  return fc
    .array(arbSubcomponent(delimiters), { maxLength: 3, minLength: 1 })
    .map((subs) => subs.join(delimiters.subcomponent));
}

/**
 * Generate a field repetition: 1–3 components joined by the component
 * delimiter.
 *
 * A "field repetition" is a single occurrence of a field value. When a field
 * repeats (e.g., multiple phone numbers), each repetition is separated by `~`.
 * Within a single repetition, components are separated by `^`.
 *
 * @example
 *   "DOE^JOHN^A" (three components: last name, first name, middle initial)
 */
function arbFieldRepetition(
  delimiters: typeof DEFAULT_ENCODING_CHARS
): fc.Arbitrary<string> {
  return fc
    .array(arbComponent(delimiters), { maxLength: 3, minLength: 1 })
    .map((comps) => comps.join(delimiters.component));
}

/**
 * Generate a field: 1–2 repetitions joined by the repetition delimiter.
 *
 * Most fields have a single value, but some (like patient phone numbers)
 * can repeat. Repetitions are separated by `~`.
 *
 * @example
 *   "DOE^JOHN~SMITH^JANE" (two repetitions of a name field)
 */
function arbField(
  delimiters: typeof DEFAULT_ENCODING_CHARS
): fc.Arbitrary<string> {
  return fc
    .array(arbFieldRepetition(delimiters), { maxLength: 2, minLength: 1 })
    .map((reps) => reps.join(delimiters.repetition));
}

/**
 * Generate a non-MSH segment line.
 *
 * A segment is a line in an HL7v2 message: a 3-letter name followed by
 * fields separated by the field delimiter.
 *
 * @example
 *   "PID|1|12345|DOE^JOHN" (PID segment with 3 fields)
 */
function arbSegment(
  delimiters: typeof DEFAULT_ENCODING_CHARS
): fc.Arbitrary<string> {
  return fc
    .tuple(
      arbSegmentName,
      fc.array(arbField(delimiters), { maxLength: 8, minLength: 1 })
    )
    .map(
      ([name, fields]) =>
        `${name}${delimiters.field}${fields.join(delimiters.field)}`
    );
}

/**
 * Build the MSH segment header with proper encoding character declaration.
 *
 * MSH is the only segment with special structural rules:
 *
 * - MSH-1 (the field separator `|`) appears between "MSH" and the encoding
 *   characters — it is NOT counted as a regular field value.
 * - MSH-2 contains the 4 remaining encoding characters (`^~\&`).
 * - Fields 3+ follow normally.
 *
 * @example
 *   buildMsh(DEFAULT_ENCODING_CHARS, ["SENDER", "FAC"])
 *   → "MSH|^~\\&|SENDER|FAC"
 */
function buildMsh(
  delimiters: typeof DEFAULT_ENCODING_CHARS,
  extraFields: string[]
): string {
  const encodingChars = `${delimiters.component}${delimiters.repetition}${delimiters.escape}${delimiters.subcomponent}`;
  // Result: MSH|^~\&|field3|field4|...
  const parts = [`MSH${delimiters.field}${encodingChars}`, ...extraFields];
  return parts.join(delimiters.field);
}

// ---------------------------------------------------------------------------
// Message generators — the top-level arbitraries used by test files
// ---------------------------------------------------------------------------

/**
 * Generate a structurally valid HL7v2 message with default delimiters
 * (`|^~\&`).
 *
 * Every generated message:
 *
 * - Starts with a properly formed MSH segment
 * - Has 3–10 fields in the MSH segment (after the encoding characters)
 * - Has 0–5 additional segments (PID, OBX, etc. with random names)
 * - Uses `\r` as the segment terminator
 *
 * This arbitrary is the foundation for:
 *
 * - **Fuzz testing**: "the parser never throws on valid input"
 * - **Round-trip testing**: "parse(msg) → serialize = msg"
 *
 * @example
 *   // Might generate:
 *   // "MSH|^~\\&|SENDER|FAC|RECV\rPID|1|12345|DOE^JOHN\rOBX|1|NM|WBC||7.5"
 */
export const arbHL7v2Message: fc.Arbitrary<string> = fc
  .tuple(
    // MSH extra fields (fields 3+): sending app, facility, receiving app, etc.
    fc.array(arbField(DEFAULT_ENCODING_CHARS), { maxLength: 10, minLength: 3 }),
    // Additional segments after MSH
    fc.array(arbSegment(DEFAULT_ENCODING_CHARS), { maxLength: 5, minLength: 0 })
  )
  .map(([mshFields, segments]) => {
    const msh = buildMsh(DEFAULT_ENCODING_CHARS, mshFields);
    return [msh, ...segments].join(DEFAULT_ENCODING_CHARS.segment);
  });

/**
 * Generate a structurally valid HL7v2 message with **randomized** delimiters.
 *
 * The HL7v2 spec allows any printable ASCII characters as delimiters, not just
 * the standard `|^~\&`. This arbitrary exercises the parser's ability to detect
 * and use non-standard delimiter sets declared in MSH-1 and MSH-2.
 *
 * **How it works:** Uses `.chain()` — first generates a random delimiter set,
 * then builds a message using those delimiters. This is a two-phase generation:
 * the second arbitrary *depends on* the output of the first.
 *
 * @example
 *   // Might generate (with delimiters #!@%*):
 *   // "MSH#!@%*#SENDER#FAC\rPID#1#12345#DOE!JOHN"
 */
export const arbHL7v2MessageCustomDelimiters: fc.Arbitrary<string> =
  arbEncodingChars.chain((delimiters) =>
    fc
      .tuple(
        fc.array(arbField(delimiters), { maxLength: 10, minLength: 3 }),
        fc.array(arbSegment(delimiters), { maxLength: 5, minLength: 0 })
      )
      .map(([mshFields, segments]) => {
        const msh = buildMsh(delimiters, mshFields);
        return [msh, ...segments].join(delimiters.segment);
      })
  );

/**
 * Apply a random mutation to a valid message string.
 *
 * Four corruption strategies, each simulating real-world failure modes:
 *
 * 1. **Truncate** — cut at a random byte position (cut-off transmission)
 * 2. **Drop segment** — remove a random segment (missing data)
 * 3. **Insert char** — inject a random character (noise/corruption)
 * 4. **Replace char** — overwrite a character (bit flip)
 */
function mutate(base: fc.Arbitrary<string>): fc.Arbitrary<string> {
  return base.chain((msg) =>
    fc.oneof(
      fc
        .integer({ max: Math.max(1, msg.length - 1), min: 1 })
        .map((pos) => msg.slice(0, pos)),

      fc
        .integer({ max: Math.max(0, msg.split("\r").length - 1), min: 0 })
        .map((idx) => {
          const segments = msg.split("\r");
          segments.splice(idx, 1);
          return segments.join("\r");
        }),

      fc
        .tuple(
          fc.integer({ max: msg.length, min: 0 }),
          fc.string({ maxLength: 1, minLength: 1 })
        )
        .map(([pos, ch]) => msg.slice(0, pos) + ch + msg.slice(pos)),

      fc
        .tuple(
          fc.integer({ max: Math.max(0, msg.length - 1), min: 0 }),
          fc.string({ maxLength: 1, minLength: 1 })
        )
        .map(([pos, ch]) => msg.slice(0, pos) + ch + msg.slice(pos + 1))
    )
  );
}

/**
 * Generate a corrupted HL7v2 message with standard delimiters.
 *
 * Starts with a valid message and applies a random mutation to simulate
 * the kinds of malformed messages that real hospital interfaces produce —
 * truncated transmissions, corrupted bytes, dropped segments.
 */
export const arbMutatedMessage: fc.Arbitrary<string> = mutate(arbHL7v2Message);

/**
 * Generate a corrupted HL7v2 message with custom (non-standard) delimiters.
 *
 * Same mutation strategies as {@link arbMutatedMessage}, but applied to
 * messages that use randomized delimiter sets. This exercises the parser's
 * ability to simultaneously detect non-standard delimiters from MSH *and*
 * cope with structural corruption.
 */
export const arbMutatedCustomDelimiterMessage: fc.Arbitrary<string> = mutate(
  arbHL7v2MessageCustomDelimiters
);

/**
 * Generate adversarial input strings that exercise parser edge cases.
 *
 * These are NOT valid HL7v2 messages — they're the kind of input a parser
 * might receive when users paste arbitrary content into an editor, or when
 * a network stream delivers garbage. The parser must never throw on these;
 * it should return a Root node (possibly empty) with diagnostic messages.
 *
 * Categories:
 *
 * - **Unicode**: emoji, CJK characters, combining marks, RTL text
 * - **Null bytes**: embedded \0 characters that can trip up C-style string
 *   handling
 * - **Near-empty**: "", "\r", "MSH", "MSH|" — partial message prefixes
 * - **Delimiter soup**: strings made entirely of delimiter characters
 * - **Large payloads**: 10KB–100KB strings to test memory and performance bounds
 */
export const arbAdversarialInput: fc.Arbitrary<string> = fc.oneof(
  // Full Unicode strings (emoji, CJK, combining marks, etc.)
  fc.string({ maxLength: 1000, minLength: 0, unit: "grapheme" }),

  // Strings with embedded null bytes
  fc.string({
    maxLength: 500,
    minLength: 0,
    unit: fc.oneof(
      fc.integer({ max: 0x7e, min: 0x20 }).map((c) => String.fromCodePoint(c)),
      fc.constant("\0")
    ),
  }),

  // Empty and near-empty strings (partial message prefixes)
  fc.constant(""),
  fc.constant("\r"),
  fc.constant("MSH"),
  fc.constant("MSH|"),

  // Strings composed entirely of delimiter characters
  fc.string({
    maxLength: 100,
    minLength: 1,
    unit: fc.constantFrom("|", "^", "~", "\\", "&", "\r"),
  }),

  // Very long strings (stress test memory and performance)
  fc.string({ maxLength: 100_000, minLength: 10_000 })
);

// ---------------------------------------------------------------------------
// Messages that fit an event schema
// ---------------------------------------------------------------------------

/** The segment IDs of one occurrence of `element`. */
const arbOccurrenceSegmentIds = (
  element: EventSchemaElement
): fc.Arbitrary<string[]> => {
  switch (element.type) {
    case "segment": {
      return fc.constant([element.name]);
    }
    case "group": {
      return arbSequenceSegmentIds(element.elements);
    }
    case "choice": {
      return fc.oneof(...element.alternatives.map(arbElementSegmentIds));
    }
  }
};

/**
 * The segment IDs of `element`, in an order its event schema accepts: an
 * optional element is present or not, a repeating one occurs once or twice,
 * and a choice takes one alternative.
 */
const arbElementSegmentIds = (
  element: EventSchemaElement
): fc.Arbitrary<string[]> =>
  fc
    .array(arbOccurrenceSegmentIds(element), {
      maxLength: element.repeating ? 2 : 1,
      minLength: element.optional ? 0 : 1,
    })
    .map((occurrences) => occurrences.flat());

const arbSequenceSegmentIds = (
  elements: readonly EventSchemaElement[]
): fc.Arbitrary<string[]> =>
  fc.tuple(...elements.map(arbElementSegmentIds)).map((parts) => parts.flat());

/**
 * An HL7v2 message of `version` whose segments fit `schema`.
 *
 * MSH-9 names the schema and MSH-12 the version. Every other segment holds
 * only its Set ID, `1`.
 */
export const arbEventSchemaMessage = (
  schema: EventSchema,
  version: string
): fc.Arbitrary<string> => {
  const [code = "", event = ""] = schema.id.split("_");
  const header = `MSH|^~\\&|APP|FAC|APP|FAC|20240101120000||${code}^${event}^${schema.id}|1|P|${version}`;
  return arbSequenceSegmentIds(schema.elements).map((ids) =>
    ids.map((id) => (id === "MSH" ? header : `${id}|1`)).join("\r")
  );
};
