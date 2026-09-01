/**
 * Parser benchmarks — measures HL7v2 text → AST conversion.
 *
 * Isolates parsing performance from the rest of the pipeline.
 */
import { parseHL7v2 } from "@glion/parser";
import { bench, describe } from "vitest";

// ---------------------------------------------------------------------------
// Fixtures — local: no other suite parses bare text at these shapes
// ---------------------------------------------------------------------------

const SIMPLE =
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20241201||ADT^A01|MSG001|P|2.5\rPID|1||12345||Doe^John||19800101|M";

const COMPLEX_FIELDS = [
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20241201||ORU^R01|MSG001|P|2.5",
  "PID|1||123~456~789||Doe^John^Q&Jr||19800101|M",
  "OBX|1|CE|8302-2^Height^LN||185&cm^tall&yes~186&cm^tall&no|cm|150-200||||F",
].join("\r");

function buildMessage(segmentCount: number): string {
  const segments = [
    "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20241201||ADT^A01|MSG001|P|2.5",
    "PID|1||12345||Doe^John^Q||19800101|M|||123 Main St^^Springfield^IL^62701",
  ];
  for (let i = 1; i <= segmentCount; i++) {
    segments.push(`OBX|${i}|NM|8302-2^Height^LN||${170 + i}|cm|150-200||||F`);
  }
  return segments.join("\r");
}

const MEDIUM = buildMessage(50);
const LARGE = buildMessage(200);

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe("parser", () => {
  bench("parser: parse 2 segments", () => {
    parseHL7v2(SIMPLE);
  });

  bench("parser: parse 52 segments", () => {
    parseHL7v2(MEDIUM);
  });

  bench("parser: parse 202 segments", () => {
    parseHL7v2(LARGE);
  });

  bench("parser: parse complex fields (repetitions, components, sub-components)", () => {
    parseHL7v2(COMPLEX_FIELDS);
  });
});
