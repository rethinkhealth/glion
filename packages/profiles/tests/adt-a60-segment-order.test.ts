import { describe, expect, it } from "vitest";

import { runner } from "../src/engine/runner";
import type { EventSchema } from "../src/engine/types";
import { profiles } from "../src/profiles";

/**
 * Regression guard for the ADT_A60 ("Adverse Reaction Message") segment-order
 * schema. The v2.4-v2.7 schemas allowed `PV2` to appear without a preceding
 * `PV1` (a direct `PID -> PV2` path, and in v2.6/v2.7 also `PID -> ARV ->
 * PV2`), so `MSH EVN PID PV2` was silently accepted. `PV2` must always follow
 * a `PV1`. These tests pin the invariant so a future schema re-import cannot
 * reintroduce the over-permissive path.
 */

const affectedVersions = ["2.4", "2.5", "2.5.1", "2.6", "2.7"] as const;

function load(version: string): Promise<EventSchema | undefined> {
  return profiles.events.load(version, "ADT_A60");
}

function isAccepted(schema: EventSchema | undefined, symbols: string[]): boolean {
  return schema !== undefined && runner(schema, symbols).type === "matched";
}

describe("ADT_A60 segment order — PV2 must follow PV1", () => {
  for (const version of affectedVersions) {
    it(`v${version}: rejects MSH EVN PID PV2 (PV2 without PV1)`, async () => {
      const def = await load(version);
      expect(isAccepted(def, ["MSH", "EVN", "PID", "PV2"])).toBe(false);
    });

    it(`v${version}: accepts MSH EVN PID PV1 PV2 (PV2 after PV1)`, async () => {
      const def = await load(version);
      expect(isAccepted(def, ["MSH", "EVN", "PID", "PV1", "PV2"])).toBe(true);
    });

    it(`v${version}: does not suggest PV2 from the PID state`, async () => {
      const def = await load(version);
      if (def === undefined) throw new Error("schema not found");
      const result = runner(def, ["MSH", "EVN", "PID", "PV2"]);
      expect(result.type).toBe("mismatched");
      if (result.type === "mismatched") {
        expect(result.expected).not.toContain("PV2");
        expect(result.expected).toContain("PV1");
      }
    });
  }

  for (const version of ["2.6", "2.7"] as const) {
    it(`v${version}: rejects MSH EVN PID ARV PV2 (PV2 via ARV, no PV1)`, async () => {
      const def = await load(version);
      expect(isAccepted(def, ["MSH", "EVN", "PID", "ARV", "PV2"])).toBe(false);
    });

    it(`v${version}: accepts MSH EVN PID ARV PV1 PV2`, async () => {
      const def = await load(version);
      expect(isAccepted(def, ["MSH", "EVN", "PID", "ARV", "PV1", "PV2"])).toBe(
        true
      );
    });
  }
});
