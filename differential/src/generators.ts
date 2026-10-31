import fc from "fast-check";

import type { SpecMessage } from "./oracle";

// The generator: random well-formed messages, in the specification's shape.
//
// An arbitrary (`fc.*`) is a recipe for a random value, not a value. fast-check
// feeds it random numbers on each run, and shrinks a failing value toward a
// smaller one. Small recipes compose into bigger ones:
//
//   chain
//   ├─ delimiters: oneof( constant "|^~\&" , shuffledSubarray(pool, 5) )
//   └─ record
//      ├─ delimiters: constant (the ones drawn above)
//      ├─ header:   array 0–4 of field
//      └─ segments: array 0–3 of record { id: 3 × SEGMENT_ID, fields: array 0–4 of field }
//
//   field = array 1–3 of repetition = array 1–3 of component = array 1–3 of data
//   data  = array 0–4 of piece, joined
//   piece = oneof( 4 × one character from DATA or the five delimiters ,
//                  1 × escape character, one of SEQUENCES, escape character )
//
// One draw (seed 42), shortened:
//   {"delimiters":"|^~\&",
//    "header":[[[["X","ZZ\T\","aTR"],["",""]],[["\R\E9","\.br\"]]]],
//    "segments":[{"id":"39G","fields":[[[["F","a-\", …],["","","F^1~"], …]]]}]}
// `ZZ\T\` is data holding the sequence `\T\`, which the specification writes
// `ZZ\E\T\E\`; `F^1~` holds two separators, written `F\S\1\R\`.
//
// Every number and list below is a limit on the scope of the properties: a
// message the generator cannot draw is never checked.

// Candidate delimiters. No letters, digits or spaces, though the specification
// allows them; no escape code ID (`F`, `S`, `T`, `R`, `E`), which it does not
// allow as a separator (`well_formed_separators_not_escape_codes`).
const DELIMITER_POOL = ["|", "^", "~", "\\", "&", "#", "*", "!", "%", "+"];
// Characters of data, besides the delimiters. No segment terminator
// (`well_formed_subcomponent_no_terminator`), and nothing below U+0020.
const DATA = [..."abcFSTREXYZ019 .-"];
// What a receiver reads between two escape characters (§2.7): the five
// delimiter codes, the formatting commands `\H\`, `\N\`, `\.br\` and `\.sp\`, a
// hexadecimal `\X41\`, and a locally defined `\Zab\`. In data they are
// characters like any other, which the specification writes with `\E\`:
// `\H\` → `\E\H\E\`. Drawn whole, since one character at a time forms one
// about 1 in 2,000 positions.
const SEQUENCES = [
  "F",
  "S",
  "T",
  "R",
  "E",
  "H",
  "N",
  ".br",
  ".sp",
  "X41",
  "Zab",
];
const SEGMENT_ID = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"];

// Five delimiters, as MSH-1 then MSH-2: field, component, repetition, escape,
// subcomponent. `oneof` picks a recipe, about half the time each:
// - the suggested `|^~\&`;
// - 5 of the 10 pool characters, in random order. `shuffledSubarray` picks
//   without putting back, so they are distinct
//   (`well_formed_delimiters_distinct`): `["#", "|", "&", "~", "^"]` → "#|&~^".
const arbDelimiters = fc.oneof(
  fc.constant("|^~\\&"),
  fc
    .shuffledSubarray(DELIMITER_POOL, { maxLength: 5, minLength: 5 })
    .map((chars) => chars.join(""))
);

// `chain` draws the delimiters first, then builds the rest of the message from
// them: data must know which character is the escape character. When
// fast-check shrinks the delimiters, everything built from them is drawn again.

/**
 * A well-formed message, by construction: distinct delimiters, none an escape
 * code ID, three-character segment IDs, at least one element at every level of
 * a field, and no segment terminator inside a subcomponent. Data may hold
 * every delimiter; the specification writes each as an escape sequence.
 */
export const arbSpecMessage: fc.Arbitrary<SpecMessage> = arbDelimiters.chain(
  (delimiters) => {
    // One subcomponent value: 0 to 4 pieces, joined. 4 times in 5 a piece is
    // one character, picked uniformly from 22 (DATA and the five
    // delimiters); otherwise a whole sequence, `\H\` with `\` the escape
    // character drawn above. 0 pieces is the empty value. fast-check leans
    // toward short arrays, so "" comes up often.
    const escape = delimiters[3] ?? "\\";
    const piece = fc.oneof(
      { arbitrary: fc.constantFrom(...DATA, ...delimiters), weight: 4 },
      {
        arbitrary: fc
          .constantFrom(...SEQUENCES)
          .map((code) => `${escape}${code}${escape}`),
        weight: 1,
      }
    );
    const data = fc
      .array(piece, { maxLength: 4 })
      .map((pieces) => pieces.join(""));
    // A field, read inside out: a component is 1–3 values, a repetition 1–3
    // components, a field 1–3 repetitions. `minLength: 1` at each level is
    // `well_formed_field_has_repetition` and the two rules after it; an empty
    // field is [[[""]]]. Each level draws its length, then each element on
    // its own: [[["R", "", "X"], ["a", "0"]], [["RR", "- "], ["FR"]]] is
    // `R&&X^a&0~RR&- ^FR`.
    const arbField = fc.array(
      fc.array(fc.array(data, { maxLength: 3, minLength: 1 }), {
        maxLength: 3,
        minLength: 1,
      }),
      { maxLength: 3, minLength: 1 }
    );
    // `record` draws each key on its own. The ID is 3 characters picked
    // uniformly from 36 (`well_formed_segment_id_length`), so `PID` is as
    // likely as `BUQ`: about 1 in 47,000.
    const arbSegment = fc.record({
      fields: fc.array(arbField, { maxLength: 4 }),
      id: fc
        .array(fc.constantFrom(...SEGMENT_ID), { maxLength: 3, minLength: 3 })
        .map((chars) => chars.join("")),
    });
    // The header is MSH-3 to MSH-6 at most; 0 to 3 segments follow MSH.
    return fc.record({
      delimiters: fc.constant(delimiters),
      header: fc.array(arbField, { maxLength: 4 }),
      segments: fc.array(arbSegment, { maxLength: 3 }),
    });
  }
);
