/**
 * Runner benchmarks — the per-segment cost of validating segment order
 * against a message structure, which the segment-order lint pays once per
 * segment.
 *
 * The ORU_R01 fixtures are group-heavy: every OBR starts a new
 * ORDER_OBSERVATION nested in PATIENT_RESULT, and every OBX an OBSERVATION
 * inside it.
 */
import { parseHL7v2 } from "@glion/parser";
import { profiles, runner } from "@glion/profiles";
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

const consumeAll = (input: readonly string[]): void => {
  const automaton = runner(structure);
  for (const symbol of input) {
    automaton.consume(symbol);
  }
};

describe("profiles-runner", () => {
  const medium = symbols(ORU_R01_MEDIUM);
  const observations = symbols(hl7(...ORU_R01_HEADER, ...repeat(oruObx, 100)));
  const orders = symbols(ORU_R01_LARGE);

  bench("profiles-runner: consume ORU_R01 (14 segments)", () => {
    consumeAll(medium);
  });

  bench("profiles-runner: consume ORU_R01 (105 segments, 100 OBX)", () => {
    consumeAll(observations);
  });

  bench("profiles-runner: consume ORU_R01 (102 segments, 50 orders)", () => {
    consumeAll(orders);
  });
});
