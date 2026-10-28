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
//   data  = array 0–4 of one character from DATA or the escape character, joined
//
// One draw (seed 42):
//   {"delimiters":"~&#+%","header":[[[["-F"]]]],
//    "segments":[{"id":"BUQ","fields":[[[["+"],["E X","b "],[""]], …]]}, …]}
// `~` separates fields and `+` is the escape character, here in data as "+".
//
// Every number and list below is a limit on the scope of the properties: a
// message the generator cannot draw is never checked.

// Candidate delimiters. No letters, digits or spaces, though the specification
// allows them.
const DELIMITER_POOL = ["|", "^", "~", "\\", "&", "#", "*", "!", "%", "+"];
// Characters of data. Includes the letters of the escape sequences of §2.7
// (`\F\`, `\S\`, `\T\`, `\R\`, `\E\`), so an escape character in data can form
// one. None is in DELIMITER_POOL, so data never holds a separator.
const DATA = [..."abcFSTREXYZ019 .-"];
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
 * A well-formed message, by construction: distinct delimiters, three-character
 * segment IDs, at least one element at every level of a field, and no
 * separator inside a subcomponent. The escape character may appear in data;
 * the specification allows it (`Delimiters.separators`).
 */
export const arbSpecMessage: fc.Arbitrary<SpecMessage> = arbDelimiters.chain(
  (delimiters) => {
    // Every delimiter but index 3, the escape character, which data may hold.
    const separators = new Set([...delimiters].filter((_, i) => i !== 3));
    // One subcomponent value: 0 to 4 characters, each picked uniformly from 18
    // (DATA and the escape character), then joined. 0 characters is the empty
    // value. fast-check leans toward short arrays, so "" comes up often.
    // `\`, an escape letter, `\` is about 1 in 1,200 per position; `\X0D\` is
    // 5 characters and never appears. The filter is a safety net: with DATA
    // as it is, it removes nothing.
    const data = fc
      .array(fc.constantFrom(...DATA, delimiters[3] ?? "\\"), { maxLength: 4 })
      .map((chars) => chars.filter((c) => !separators.has(c)).join(""));
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
