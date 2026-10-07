/**
 * Group transform benchmarks: the cost of nesting a parsed message's
 * segments in the groups its event schema defines. The schema is ORU_R01
 * v2.5.1, which nests OBSERVATION in ORDER_OBSERVATION in PATIENT_RESULT.
 *
 * The transform resolves the schema from MSH-9 and MSH-12; a schema loads
 * once per process, so after the first iteration that is a cached lookup.
 *
 * The transform replaces the root's children and changes no segment, so each
 * iteration runs on a fresh root over the same segment nodes.
 */
import { parseHL7v2 } from "@glion/parser";
import { hl7v2TransformProfileGroups } from "@glion/transform-profile-groups";
import { unified } from "unified";
import { VFile } from "vfile";
import { bench, describe } from "vitest";

import { ORU_R01_LARGE, ORU_R01_MEDIUM } from "../fixtures/messages";

const transform = unified().use(hl7v2TransformProfileGroups);

describe("transform-profile-groups", () => {
  const medium = parseHL7v2(ORU_R01_MEDIUM);
  const large = parseHL7v2(ORU_R01_LARGE);

  bench("transform-profile-groups: group ORU_R01 (14 segments)", async () => {
    await transform.run(
      { ...medium, children: [...medium.children] },
      new VFile()
    );
  });

  bench("transform-profile-groups: group ORU_R01 (102 segments, 50 orders)", async () => {
    await transform.run(
      { ...large, children: [...large.children] },
      new VFile()
    );
  });
});
