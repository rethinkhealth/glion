/**
 * Repair benchmarks: the cost of reading a message that does not fit its
 * event schema as the nearest message that does. The segment-order lint does
 * this once per message the runner rejects.
 *
 * Input is segment IDs only, so parsing is not measured. The schema is
 * ORU_R01 v2.5.1, as in profiles-runner; each message lacks its first OBR.
 */
import { parseHL7v2 } from "@glion/parser";
import { profiles, repair } from "@glion/profiles";
import { bench, describe } from "vitest";

import { ORU_R01_LARGE, ORU_R01_MEDIUM } from "../fixtures/messages";

// The segment IDs of a message, in order, without its first OBR.
const withoutFirstObr = (message: string): string[] => {
  const segmentIds = parseHL7v2(message).children.map((node) =>
    node.type === "segment" ? node.name : ""
  );
  return segmentIds.toSpliced(segmentIds.indexOf("OBR"), 1);
};

// Loaded once: loading is not measured.
const schema = await profiles.events.load("2.5.1", "ORU_R01");
if (!schema) {
  throw new Error("ORU_R01 is not bundled in 2.5.1");
}

describe("profiles-repair", () => {
  const medium = withoutFirstObr(ORU_R01_MEDIUM);
  const orders = withoutFirstObr(ORU_R01_LARGE);

  // A typical message, one segment missing.
  bench("profiles-repair: repair ORU_R01 (13 segments, OBR missing)", () => {
    repair(schema, medium);
  });

  // Many orders, the first without its OBR.
  bench("profiles-repair: repair ORU_R01 (101 segments, 50 orders, OBR missing)", () => {
    repair(schema, orders);
  });
});
