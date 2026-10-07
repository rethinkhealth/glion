/**
 * Regression for https://github.com/rethinkhealth/glion/issues/867.
 *
 * Date: 2026-10-06
 * Symptom: in the v2.2 to v2.4 master-file and query schemas, the slot for a
 * site's Z-segment never matched: `MSH MFI MFE ZL1` against v2.2 MFN_M01 was
 * a mismatch at ZL1, with `anyZSegment` among the expected segments.
 * Cause: the HL7 v2 XML schemas name that slot `anyZSegment`, and the engine
 * read the name as a literal segment ID that no message carries.
 * Resolution: a segment element named `anyZSegment` matches any segment ID
 * that starts with Z, as `Hxx` matches any segment ID.
 */

import { describe, expect, it } from "vitest";

import { runner } from "../../src/engine/runner";
import type { EventSchema } from "../../src/engine/types";
import MFN_M01_2_2 from "../../src/profiles/v2.2/events/MFN_M01.json";

const MFN_M01 = MFN_M01_2_2 as EventSchema;

describe("the anyZSegment slot of v2.2 MFN_M01", () => {
  it("takes the master file entry's Z-segment, even when Z-segments are not allowed elsewhere", () => {
    expect(
      runner(MFN_M01, ["MSH", "MFI", "MFE", "ZL1"], { allowZSegments: false })
    ).toEqual({
      groups: [0, 1, { children: [2, 3], name: "MF" }],
      type: "matched",
    });
  });

  it("takes one Z-segment per master file entry", () => {
    expect(runner(MFN_M01, ["MSH", "MFI", "MFE", "ZL1", "MFE", "ZL2"])).toEqual(
      {
        groups: [
          0,
          1,
          { children: [2, 3], name: "MF" },
          { children: [4, 5], name: "MF" },
        ],
        type: "matched",
      }
    );
  });

  it("does not take a segment that is not a Z-segment", () => {
    expect(
      runner(MFN_M01, ["MSH", "MFI", "MFE", "PID"], { allowZSegments: false })
    ).toEqual({
      expected: ["MFE", "anyZSegment"],
      index: 3,
      type: "mismatched",
    });
  });
});
