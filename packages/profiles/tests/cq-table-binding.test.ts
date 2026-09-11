import { describe, expect, it } from "vitest";

import { createProfiles } from "../src/profiles";

/**
 * Regression guard for the CQ field-level table-binding mis-attribution.
 *
 * Table 0126 ("Quantity limited request") binds to the *Units* component
 * (CQ.2) of the CQ datatype, not to the field. The `FieldProfile.table` field
 * is field-level metadata with no component index, so attaching 0126 to a
 * CQ-typed field made `@glion/lint-profile-table-values` validate the numeric
 * Quantity (CQ.1) against the units code table — a deterministic false
 * positive on every populated value.
 *
 * The fix removes the field-level `table` binding from CQ-typed fields:
 *
 * - QRD-7 across v2.1–v2.6
 * - RCP-2 across v2.4–v2.8.2
 *
 * These tests load the affected segment profiles directly and assert that
 * the CQ fields carry no field-level `table`, while an adjacent coded field
 * on the same segment retains its (correct) field-level binding — proving
 * the removal was targeted rather than accidental.
 */

const QRD_VERSIONS = [
  "2.1",
  "2.2",
  "2.3",
  "2.3.1",
  "2.4",
  "2.5",
  "2.5.1",
  "2.6",
];
const RCP_VERSIONS = [
  "2.4",
  "2.5",
  "2.5.1",
  "2.6",
  "2.7",
  "2.7.1",
  "2.8",
  "2.8.1",
  "2.8.2",
];

describe("CQ field-level table binding removal", () => {
  describe("QRD-7 (CQ) has no field-level table across v2.1–v2.6", () => {
    it.each(QRD_VERSIONS)(
      "v%s QRD-7 is CQ with no table, QRD-2 retains HL70106",
      async (version) => {
        const profiles = createProfiles();
        const def = await profiles.fields.load(version, "QRD");

        const qrd7 = def.bySequence.get(7);
        expect(qrd7).toBeDefined();
        expect(qrd7?.id).toBe("QRD-7");
        expect(qrd7?.datatype).toBe("CQ");
        // The mis-attributed field-level 0126 binding must be absent.
        expect(qrd7?.table).toBeUndefined();

        // Targeted-removal guard: QRD-2 (ID) keeps its correct field-level
        // binding to table 0106 on the same segment.
        const qrd2 = def.bySequence.get(2);
        expect(qrd2).toBeDefined();
        expect(qrd2?.table).toBe("HL70106");
      }
    );
  });

  describe("RCP-2 (CQ) has no field-level table across v2.4–v2.8.2", () => {
    it.each(RCP_VERSIONS)(
      "v%s RCP-2 is CQ with no table, RCP-1 retains HL70091",
      async (version) => {
        const profiles = createProfiles();
        const def = await profiles.fields.load(version, "RCP");

        const rcp2 = def.bySequence.get(2);
        expect(rcp2).toBeDefined();
        expect(rcp2?.id).toBe("RCP-2");
        expect(rcp2?.datatype).toBe("CQ");
        // The mis-attributed field-level 0126 binding must be absent.
        expect(rcp2?.table).toBeUndefined();

        // Targeted-removal guard: RCP-1 (ID) keeps its correct field-level
        // binding to table 0091 on the same segment.
        const rcp1 = def.bySequence.get(1);
        expect(rcp1).toBeDefined();
        expect(rcp1?.table).toBe("HL70091");
      }
    );
  });

  it("no CQ-typed field in QRD/RCP carries a field-level 0126 binding", async () => {
    // Sweep every affected version and confirm the HL70126 binding is gone
    // from every CQ field on QRD and RCP segments (not just the primary one).
    const profiles = createProfiles();
    for (const version of QRD_VERSIONS) {
      const def = await profiles.fields.load(version, "QRD");
      for (const field of def.bySequence.values()) {
        if (field.datatype === "CQ") {
          expect(field.table, `${version} ${field.id}`).toBeUndefined();
        }
      }
    }
    for (const version of RCP_VERSIONS) {
      const def = await profiles.fields.load(version, "RCP");
      for (const field of def.bySequence.values()) {
        if (field.datatype === "CQ") {
          expect(field.table, `${version} ${field.id}`).toBeUndefined();
        }
      }
    }
  });
});
