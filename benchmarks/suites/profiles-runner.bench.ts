/**
 * Runner benchmarks: the cost of checking a message's segment order against
 * its message structure. The segment-order lint does this once per message.
 *
 * Input is segment names only, so parsing is not measured. The structure is
 * ORU_R01 v2.5.1, which nests OBSERVATION in ORDER_OBSERVATION in
 * PATIENT_RESULT.
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

// The segment names of a message, in order.
const symbols = (message: string): string[] =>
  parseHL7v2(message).children.map((node) =>
    node.type === "segment" ? node.name : ""
  );

// Loaded once: loading is not measured.
const structure = await profiles.events.load("2.5.1", "ORU_R01");

// One message: a new runner, then every segment. A runner is single-use, so
// creating it is part of the cost.
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

  // A typical message.
  bench("profiles-runner: consume ORU_R01 (14 segments)", () => {
    consumeAll(medium);
  });

  // One order with many results: the runner repeats one group.
  bench("profiles-runner: consume ORU_R01 (105 segments, 100 OBX)", () => {
    consumeAll(observations);
  });

  // Many orders: every other segment leaves one group and enters the next.
  bench("profiles-runner: consume ORU_R01 (102 segments, 50 orders)", () => {
    consumeAll(orders);
  });
});
