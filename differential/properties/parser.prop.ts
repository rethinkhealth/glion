// The parser reads the specification's text as the message it encodes.
//
// Tests `encode_injective` (`spec/Hl7v2/Thm/Encoding.lean`): a well-formed
// text has one meaning, the message `decode` recovers (`decode_encode`), and
// the parser must find the same one. Scope: every message `arbSpecMessage`
// draws; see `src/generators.ts` for what it leaves out.
//
// Fails today on a finding: glion decodes the escape sequences of §2.7 and the
// specification has none, so `\S\` in data is read as `^`. No mutant is
// recorded until the finding is settled.
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
