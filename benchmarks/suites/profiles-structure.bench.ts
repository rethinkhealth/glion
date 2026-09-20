/**
 * Matching benchmarks: the cost of grouping a message's segments into the
 * groups its message structure defines. `matchStructure` does this once per
 * message.
 *
 * Input is segment names only, so parsing is not measured. Same structure and
 * same three messages as `profiles-runner.bench.ts`, so the two suites compare
 * checking order with grouping on equal input.
 */
import { parseHL7v2 } from "@glion/parser";
import { matchStructure, profiles } from "@glion/profiles";
import { bench, describe } from "vitest";

import {
  ORU_R01_HEADER,
  ORU_R01_LARGE,
  ORU_R01_MEDIUM,
  hl7,
  oruObx,
  repeat,
} from "../fixtures/messages";

// The segment names of a message, in order.
const symbols = (message: string): string[] =>
  parseHL7v2(message).children.map((node) =>
    node.type === "segment" ? node.name : ""
  );

// Loaded once: loading is not measured.
const structure = await profiles.events.load("2.5.1", "ORU_R01");

describe("profiles-structure", () => {
  const medium = symbols(ORU_R01_MEDIUM);
  const observations = symbols(hl7(...ORU_R01_HEADER, ...repeat(oruObx, 100)));
  const orders = symbols(ORU_R01_LARGE);

  // A typical message.
  bench("profiles-structure: match ORU_R01 (14 segments)", () => {
    matchStructure(structure, medium);
  });

  // One order with many results: 100 OBSERVATION groups inside one order.
  bench("profiles-structure: match ORU_R01 (105 segments, 100 OBX)", () => {
    matchStructure(structure, observations);
  });

  // Many orders: 50 ORDER_OBSERVATION groups, each closed before the next.
  bench("profiles-structure: match ORU_R01 (102 segments, 50 orders)", () => {
    matchStructure(structure, orders);
  });

  // The one-time cost of a structure's first use, when it is compiled. The
  // result is cached per structure object, so the copy makes every iteration
  // a first use. The one-segment message keeps matching out of the number.
  bench("profiles-structure: first use of ORU_R01", () => {
    matchStructure({ ...structure }, ["MSH"]);
  });
});
