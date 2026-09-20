/**
 * Message structure matching benchmarks — the per-message cost of grouping
 * segments by their message structure.
 *
 * Uses the same three ORU_R01 inputs as `profiles-runner.bench.ts`.
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

const symbols = (message: string): string[] =>
  parseHL7v2(message).children.map((node) =>
    node.type === "segment" ? node.name : ""
  );

const structure = await profiles.events.load("2.5.1", "ORU_R01");

describe("profiles-structure", () => {
  const medium = symbols(ORU_R01_MEDIUM);
  const observations = symbols(hl7(...ORU_R01_HEADER, ...repeat(oruObx, 100)));
  const orders = symbols(ORU_R01_LARGE);

  bench("profiles-structure: match ORU_R01 (14 segments)", () => {
    matchStructure(structure, medium);
  });

  bench("profiles-structure: match ORU_R01 (105 segments, 100 OBX)", () => {
    matchStructure(structure, observations);
  });

  bench("profiles-structure: match ORU_R01 (102 segments, 50 orders)", () => {
    matchStructure(structure, orders);
  });

  // A structure is compiled the first time it is used, per structure object:
  // the copy makes every iteration a first use.
  bench("profiles-structure: first use of ORU_R01", () => {
    matchStructure({ ...structure }, ["MSH"]);
  });
});
