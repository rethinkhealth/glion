/**
 * Query utility benchmarks — measures path parsing and AST traversal.
 *
 * Focuses on MSH field reads since multiple lint rules and plugins
 * read MSH-9, MSH-12, etc. on every message.
 */
import { parseHL7v2 } from "@glion/parser";
import { select, value } from "@glion/util-query";
import { bench, describe } from "vitest";

// ---------------------------------------------------------------------------
// Fixtures — local: shapes specific to path-lookup benches
// ---------------------------------------------------------------------------

const SMALL_MESSAGE =
  "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20241201120000||ADT^A01^ADT_A01|MSG001|P|2.5.1\rPID|1||12345||Doe^John||19800101|M";

const LARGE_MESSAGE = [
  "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG002|P|2.5.1",
  "PID|1||12345^^^MRN||Doe^John^Q||19800101|M",
  ...Array.from(
    { length: 50 },
    (_, i) =>
      `OBX|${i + 1}|NM|8302-${i}^Test${i}^LN||${(100 + i).toFixed(1)}|mg/dL|50-200|N|||F`
  ),
].join("\r");

const smallTree = parseHL7v2(SMALL_MESSAGE);
const largeTree = parseHL7v2(LARGE_MESSAGE);

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe("query", () => {
  bench("query: value(tree, 'MSH-12') — small message", () => {
    value(smallTree, "MSH-12");
  });

  bench("query: value(tree, 'MSH-12') — large message", () => {
    value(largeTree, "MSH-12");
  });

  bench("query: value(tree, 'MSH-9.1') — small message", () => {
    value(smallTree, "MSH-9.1");
  });

  bench("query: select(tree, 'PID-5') — small message", () => {
    select(smallTree, "PID-5");
  });

  bench("query: select(tree, 'OBX-5') — large message (first match)", () => {
    select(largeTree, "OBX-5");
  });
});
