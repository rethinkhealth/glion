// The serializer writes a parsed message back as the specification's text.
//
// Tests `encode` (`spec/Hl7v2/Spec/Encoding.lean`): the text a sender writes
// for a message is the text the specification writes. Scope: every message
// `arbSpecMessage` draws; see `src/generators.ts` for what it leaves out.
//
// Fails today on three findings:
//
// - #1165: data that looks like an escape sequence is written back as one.
//   With `&` as the escape character, the data `&N&` arrives as `&E&N&E&`
//   and is written back as the command `&N&`:
//   `{"delimiters":"#*!&^","header":[],"segments":[{"fields":[[[["&N&"],[""]]]],"id":"AAA"}]}`.
// - #1166: `\P\` is written back as the data `\E\P\E\`:
//   `{"delimiters":"|^~\\&","header":[[[[[{"sequence":"P"}],""]]]],"segments":[]}`.
// - #1168: `\X41\` is written back as `A`, and `\X0D\` as `\.br\` (#1167):
//   `{"delimiters":"|^~\\&","header":[],"segments":[{"fields":[[[[[{"sequence":"X41"}],""]]]],"id":"AAA"}]}`.
//
// No mutant is recorded until the findings are settled.
import { hl7v2AnnotateDelimiters } from "@glion/annotate-delimiters";
import { hl7v2Parser } from "@glion/parser";
import { hl7v2ToHl7v2 } from "@glion/to-hl7v2";
import fc from "fast-check";
import { unified } from "unified";

import { arbSpecMessage } from "../src/generators";
import { startOracle } from "../src/oracle";

const roundTrip = unified()
  .use(hl7v2Parser)
  .use(hl7v2AnnotateDelimiters)
  .use(hl7v2ToHl7v2)
  .freeze();

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
