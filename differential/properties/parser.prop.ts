// The parser reads the specification's text as the message it encodes.
//
// Tests `encode_injective` (`spec/Hl7v2/Thm/Encoding.lean`): a well-formed
// text has one meaning, the message `decode` recovers (`decode_encode`), and
// the parser must find the same one. Scope: every message `arbSpecMessage`
// draws; see `src/generators.ts` for what it leaves out.
//
// Fails today on a finding (#1165): glion holds a value as one string, so
// data that looks like an escape sequence and the sequence itself are the same
// string. With `#` as the escape character, the data `#F#` is sent as
// `#E#F#E#`, and glion reads it back as the sequence `#F#`:
// `{"delimiters":"!+&#%","header":[[[["#F#"]]]],"segments":[]}`.
//
// And on #1168: glion reads hexadecimal data as characters, `\X41\` as `A`,
// where §2.7.6 leaves its meaning to sender and receiver:
// `{"delimiters":"|^~\\&","header":[[[[[{"sequence":"X41"}]]]]],"segments":[]}`.
//
// Mutant: `decodeEscapes` in `@glion/utils` decodes `\S\` to the repetition
// separator. Fails on
// `{"delimiters":"|^~\\&","header":[],"segments":[{"fields":[[[["^",""]],[[""]]]],"id":"AAA"}]}`.
import { hl7v2Parser } from "@glion/parser";
import fc from "fast-check";
import { unified } from "unified";

import { toSpecMessage } from "../src/abstraction";
import { arbSpecMessage } from "../src/generators";
import { startOracle } from "../src/oracle";

const parser = unified().use(hl7v2Parser);

const oracle = startOracle();
afterAll(oracle.close);

it("the parser reads the specification's text as the same message", async () => {
  await fc.assert(
    fc.asyncProperty(arbSpecMessage, async (message) => {
      const { text } = await oracle.ask(message);
      expect(toSpecMessage(parser.parse(text))).toEqual(message);
    }),
    { numRuns: 200 }
  );
});
