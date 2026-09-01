/**
 * Profile lint preset benchmarks — the cost of running all profile-based
 * lint rules on messages with mostly empty fields.
 *
 * This suite is sensitive to the "early empty check" optimization:
 * checking isEmptyNode() before profile lookups avoids Map lookups
 * for the majority of fields in typical HL7v2 messages.
 */
import { m } from "@glion/builder";
import hl7v2PresetLintProfileRecommended from "@glion/preset-lint-profile-recommended";
import { profiles } from "@glion/profiles";
import { unified } from "unified";
import { VFile } from "vfile";
import { bench, describe } from "vitest";

import {
  evn,
  evnInvalid,
  msh,
  obx,
  pidInvalid,
  repeat,
  validPid,
} from "../fixtures/messages";

const processor = unified().use(hl7v2PresetLintProfileRecommended);

describe("lint-profile", () => {
  const small = m(msh(), evn(), validPid());
  const medium = m(msh(), evn(), validPid(), ...repeat(obx, 10));
  const large = m(msh(), evn(), validPid(), ...repeat(obx, 50));
  const xl = m(msh(), evn(), validPid(), ...repeat(obx, 100));
  const violations = m(msh(), evnInvalid(), pidInvalid());

  bench("lint-profile: validate 3 segments", async () => {
    await processor.run(small, new VFile());
  });

  bench("lint-profile: validate 13 segments", async () => {
    await processor.run(medium, new VFile());
  });

  bench("lint-profile: validate 53 segments", async () => {
    await processor.run(large, new VFile());
  });

  bench("lint-profile: validate 103 segments", async () => {
    await processor.run(xl, new VFile());
  });

  bench("lint-profile: violations (3 segments)", async () => {
    await processor.run(violations, new VFile());
  });
});

// Cold-cache benches mutate the shared profiles singleton, so they run in
// their own trailing describe: the reset is part of the measured cold path
// and must never precede a warm bench in file order.
describe("lint-profile — cold cache", () => {
  const small = m(msh(), evn(), validPid());
  const large = m(msh(), evn(), validPid(), ...repeat(obx, 50));

  bench("lint-profile: validate 3 segments (cold cache)", async () => {
    profiles.reset();
    await processor.run(small, new VFile());
  });

  bench("lint-profile: validate 53 segments (cold cache)", async () => {
    profiles.reset();
    await processor.run(large, new VFile());
  });
});
