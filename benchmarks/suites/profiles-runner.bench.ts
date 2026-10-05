/**
 * Runner benchmarks: the cost of running a message's segment IDs through its
 * message structure, which validates their order and groups them. The
 * segment-order lint and the group transform each do this once per message.
 *
 * Input is segment IDs only, so parsing is not measured. The structure is
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

// The segment IDs of a message, in order.
const segmentIds = (message: string): string[] =>
  parseHL7v2(message).children.map((node) =>
    node.type === "segment" ? node.name : ""
  );

// Loaded once: loading is not measured.
const structure = await profiles.events.load("2.5.1", "ORU_R01");

describe("profiles-runner", () => {
  const medium = segmentIds(ORU_R01_MEDIUM);
  const observations = segmentIds(
    hl7(...ORU_R01_HEADER, ...repeat(oruObx, 100))
  );
  const orders = segmentIds(ORU_R01_LARGE);

  // A typical message.
  bench("profiles-runner: run ORU_R01 (14 segments)", () => {
    runner(structure, medium);
  });

  // One order with many results: the run repeats one group.
  bench("profiles-runner: run ORU_R01 (105 segments, 100 OBX)", () => {
    runner(structure, observations);
  });

  // Many orders: every other segment leaves one group and enters the next.
  bench("profiles-runner: run ORU_R01 (102 segments, 50 orders)", () => {
    runner(structure, orders);
  });

  // The one-time cost of a structure's first use, when it is compiled. The
  // program is cached per structure object, so the copy makes every iteration
  // a first use. The one-segment message keeps the run out of the number.
  bench("profiles-runner: first use of ORU_R01", () => {
    runner({ ...structure }, ["MSH"]);
  });
});
