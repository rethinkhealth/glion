import { describe, expect, it } from "vitest";

import { effects } from "../../src/profiles/v2.4/events/ORS_O06";

describe("ORS_O06 v2.4 effects group identifiers", () => {
  it("never emit the misspelled 'RSPONSE' group identifier", () => {
    const all = Object.values(effects).flatMap((e) => [
      ...e.groupsOpened,
      ...e.groupsClosed,
    ]);
    expect(all.some((p) => p.includes("RSPONSE"))).toBe(false);
  });

  it("use only the canonical RESPONSE/{PATIENT,ORDER} hierarchy", () => {
    const all = Object.values(effects).flatMap((e) => [
      ...e.groupsOpened,
      ...e.groupsClosed,
    ]);
    expect(new Set(all)).toEqual(
      new Set([
        "ORS_O06/RESPONSE",
        "ORS_O06/RESPONSE/PATIENT",
        "ORS_O06/RESPONSE/ORDER",
      ])
    );
  });
});
