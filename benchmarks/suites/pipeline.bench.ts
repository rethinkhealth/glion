/**
 * End-to-end unified pipeline benchmarks.
 *
 * Measures the full user-facing path: parse → structure → decode → lint →
 * jsonify. These are the primary benchmarks tracked by CodSpeed for regression
 * detection.
 */
import { parseHL7v2 } from "@glion/hl7v2";
import { bench, describe } from "vitest";

import {
  ADT_A01_SMALL,
  hl7,
  ORU_R01_HEADER,
  ORU_R01_MEDIUM,
  oruObx,
  repeat,
} from "../fixtures/messages";

const LARGE_50 = hl7(...ORU_R01_HEADER, ...repeat(oruObx, 50));
const LARGE_200 = hl7(...ORU_R01_HEADER, ...repeat(oruObx, 200));

describe("pipeline", () => {
  bench("pipeline: process ADT^A01 (3 segments)", async () => {
    await parseHL7v2.process(ADT_A01_SMALL);
  });

  bench("pipeline: process ORU^R01 (14 segments)", async () => {
    await parseHL7v2.process(ORU_R01_MEDIUM);
  });

  bench("pipeline: process ORU^R01 (55 segments)", async () => {
    await parseHL7v2.process(LARGE_50);
  });

  bench("pipeline: process ORU^R01 (205 segments)", async () => {
    await parseHL7v2.process(LARGE_200);
  });
});
