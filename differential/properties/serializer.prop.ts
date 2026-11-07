// The serializer writes a parsed message back as the specification's text.
//
// Tests `encode` (`spec/Hl7v2/Spec/Encoding.lean`): the text a sender writes
// for a message is the text the specification writes. Scope: every message
// `arbSpecMessage` draws; see `src/generators.ts` for what it leaves out.
//
// Held since #1169 (ADR 0036), which fixed #1165, #1166, #1167 and the writing of #1168: the
// serializer writes back every sequence glion kept as written.
//
// Mutant: `to-hl7v2` writes a value without `escapes.write`. Fails on
// `{"delimiters":"|^~\\&","header":[[[["&"]]]],"segments":[]}`. The parser's
// mutant survives here: the table is shared by both directions, so a wrong
// code is read and written back the same way.
import { hl7v2Parser } from "@glion/parser";
import { hl7v2ToHl7v2 } from "@glion/to-hl7v2";
import fc from "fast-check";
import { unified } from "unified";

import { arbSpecMessage } from "../src/generators";
import { startOracle } from "../src/oracle";

const roundTrip = unified().use(hl7v2Parser).use(hl7v2ToHl7v2).freeze();

const oracle = startOracle();
afterAll(oracle.close);

it("the serializer writes the message back as the specification's text", async () => {
  await fc.assert(
    fc.asyncProperty(arbSpecMessage, async (message) => {
      const { text } = await oracle.ask(message);
      expect(String(await roundTrip.process(text))).toBe(text);
    }),
    { numRuns: 200 }
  );
});
