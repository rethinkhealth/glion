import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import type { Field } from "@glion/builder";
import { c, f, m, s } from "@glion/builder";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintTableValues from "../src";

/**
 * Regression tests for the CQ field-level table binding mis-attribution.
 *
 * Table 0126 ("Quantity limited request") binds to the *Units* component
 * (CQ.2) of the CQ datatype — not to the field. HL7 v2 binds 0126 to CQ.2 in
 * the spec prose only; there is no field-level table column for the composite.
 *
 * `@glion/lint-profile-table-values` applies a field-level `table` binding to
 * the first component's first sub-component value. For a CQ field that is the
 * numeric Quantity (CQ.1), so a field-level `table: "HL70126"` binding caused
 * every populated CQ value (e.g. "5^LI") to be reported as invalid against the
 * units code table {CH, LI, PG, RD, ZO}.
 *
 * The fix removes the field-level `table` binding from CQ-typed fields
 * (QRD-7 across v2.1–v2.6, RCP-2 across v2.4–v2.8.2). These tests confirm the
 * false positive is gone while adjacent ID/CE-coded fields still validate.
 */

/** MSH segment carrying the HL7 version in MSH-12. */
function msh(version: string) {
  return s(
    "MSH",
    f("|"),
    f("^~\\&"),
    f("SENDER"),
    f("FAC"),
    f("RECV"),
    f("RFAC"),
    f("20241201"),
    f(""),
    f(c("ADT"), c("A01"), c("ADT_A01")),
    f("MSG001"),
    f("P"),
    f(version)
  );
}

/** A CQ value rendered as a field: a quantity and an (optional) units code. */
function cq(quantity: string, units?: string): Field {
  return units === undefined ? f(c(quantity)) : f(c(quantity), c(units));
}

/**
 * Build a QRD segment with the given QRD-7 (CQ) field.
 * QRD-2 ("R") and QRD-3 ("I") use valid codes for tables 0106 and 0091.
 */
function qrd(qrd7: Field) {
  return s(
    "QRD",
    f("20241201120000"), // QRD-1  Query Date/Time (TS)
    f("R"), // QRD-2  Query Format Code (ID, table 0106) — valid
    f("I"), // QRD-3  Query Priority (ID, table 0091) — valid
    f("Q1"), // QRD-4  Query ID (ST)
    f(""), // QRD-5  Deferred Response Type
    f(""), // QRD-6  Deferred Response Date/Time
    qrd7, // QRD-7  Quantity Limited Request (CQ)
    f(c("SMITH")), // QRD-8  Who Subject Filter
    f(c("REC")), // QRD-9  What Subject Filter
    f(c("PHARM")), // QRD-10 What Department Data Code
    f(""), // QRD-11 What Data Code Value Qual.
    f("R") // QRD-12 Query Results Level
  );
}

/**
 * Build an RCP segment with the given RCP-2 (CQ) field.
 * RCP-1 ("I") uses a valid code for table 0091.
 */
function rcp(rcp2: Field) {
  return s(
    "RCP",
    f("I"), // RCP-1 Query Priority (ID, table 0091) — valid
    rcp2, // RCP-2 Quantity Limited Request (CQ)
    f(""), // RCP-3 Response Modality (CE, table 0394)
    f(""), // RCP-4 Execution and Delivery Time (TS)
    f("") // RCP-5 Modify Indicator (ID, table 0395)
  );
}

async function lint(tree: ReturnType<typeof m>) {
  const file = new VFile();
  await unified()
    .use(hl7v2AnnotateProfileContext)
    .use(hl7v2LintTableValues)
    .run(tree, file);
  return file;
}

describe("CQ field-level table binding (QRD-7 / RCP-2)", () => {
  describe("QRD-7 (CQ) no longer validated against units table 0126", () => {
    it.each([
      ["2.5.1", cq("5", "LI")], // documented default ("5 lines")
      ["2.5", cq("5", "LI")],
      ["2.6", cq("10", "PG")], // "10 pages"
      ["2.4", cq("100", "RD")], // "100 records"
      ["2.3.1", cq("5", "CH")], // "5 characters"
      ["2.2", cq("5", "LI")],
      ["2.3", cq("5", "LI")],
      ["2.1", cq("5", "LI")],
    ])(
      "v%s QRD-7 spec-compliant CQ value emits no table-values error",
      async (version, field) => {
        const file = await lint(m(msh(version), qrd(field)));

        const qrd7Errors = file.messages.filter(
          (x) => x.ruleId === "table-values" && x.message.includes("QRD-7")
        );
        expect(qrd7Errors).toHaveLength(0);
      }
    );

    it("does not flag the Quantity sub-component when Units is absent", async () => {
      // CQ.1 is a numeric quantity (NM); even with no Units (CQ.2) it must not be
      // checked against the units code table.
      const file = await lint(m(msh("2.5.1"), qrd(cq("5"))));

      const qrd7Errors = file.messages.filter(
        (x) => x.ruleId === "table-values" && x.message.includes("QRD-7")
      );
      expect(qrd7Errors).toHaveLength(0);
    });
  });

  describe("RCP-2 (CQ) no longer validated against units table 0126", () => {
    it.each([
      ["2.5.1", cq("5", "LI")],
      ["2.5", cq("5", "LI")],
      ["2.6", cq("10", "PG")],
      ["2.4", cq("100", "RD")],
      ["2.7", cq("5", "LI")],
      ["2.7.1", cq("5", "LI")],
      ["2.8", cq("5", "LI")],
      ["2.8.1", cq("5", "LI")],
      ["2.8.2", cq("5", "LI")],
    ])(
      "v%s RCP-2 spec-compliant CQ value emits no table-values error",
      async (version, field) => {
        const file = await lint(m(msh(version), rcp(field)));

        const rcp2Errors = file.messages.filter(
          (x) => x.ruleId === "table-values" && x.message.includes("RCP-2")
        );
        expect(rcp2Errors).toHaveLength(0);
      }
    );
  });

  describe("adjacent coded fields still validate (no regression)", () => {
    it("QRD-2 invalid code still triggers a table-values error", async () => {
      // QRD-2 (ID, table 0106 "Query/response format code", codes {D,R,T}).
      // "Z" is invalid and must still be flagged — proving the rule still
      // runs on non-CQ coded fields after the CQ binding was removed.
      const tree = m(
        msh("2.5.1"),
        s(
          "QRD",
          f("20241201120000"), // QRD-1
          f("Z"), // QRD-2  invalid code
          f("I"), // QRD-3
          f("Q1"), // QRD-4
          f(""), // QRD-5
          f(""), // QRD-6
          cq("5", "LI"), // QRD-7  CQ — must NOT be flagged
          f(c("SMITH")), // QRD-8
          f(c("REC")), // QRD-9
          f(c("PHARM")), // QRD-10
          f(""), // QRD-11
          f("R") // QRD-12
        )
      );
      const file = await lint(tree);

      const qrd2Errors = file.messages.filter(
        (x) => x.ruleId === "table-values" && x.message.includes("QRD-2")
      );
      expect(qrd2Errors).toHaveLength(1);
      expect(qrd2Errors[0]?.message).toContain("Z");
      expect(qrd2Errors[0]?.message).toContain("0106");

      // QRD-7 (CQ) must still not be flagged in this same message.
      const qrd7Errors = file.messages.filter(
        (x) => x.ruleId === "table-values" && x.message.includes("QRD-7")
      );
      expect(qrd7Errors).toHaveLength(0);
    });

    it("QRD-2 valid code emits no table-values error", async () => {
      const tree = m(
        msh("2.5.1"),
        s(
          "QRD",
          f("20241201120000"),
          f("R"), // QRD-2 valid code in table 0106
          f("I"),
          f("Q1"),
          f(""),
          f(""),
          cq("5", "LI"),
          f(c("SMITH")),
          f(c("REC")),
          f(c("PHARM")),
          f(""),
          f("R")
        )
      );
      const file = await lint(tree);
      const qrd2Errors = file.messages.filter(
        (x) => x.ruleId === "table-values" && x.message.includes("QRD-2")
      );
      expect(qrd2Errors).toHaveLength(0);
    });
  });
});
