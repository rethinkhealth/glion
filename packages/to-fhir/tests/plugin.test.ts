import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { TranslationSchemaError } from "../src/schema-check";
import { oruR01 } from "../src/schema/oru-r01";
import type { ResourceRule, TranslationSchema } from "../src/types";
import { bundleOf, compile } from "./processor";

const message = readFileSync(
  new URL("fixtures/oru-r01.hl7", import.meta.url),
  "utf8"
);

/** An ORU^R01 with no order group, which the profile cannot group. */
const ungrouped = [
  "MSH|^~\\&|LAB|CENTRAL_LAB|EHR|GENERAL_HOSPITAL|20261014093000||ORU^R01^ORU_R01|LAB20261014-7783|P|2.5.1",
  "PID|1||MRN445566^^^GENERAL_HOSPITAL^MR||RIVERA^MARIA^ELENA^^^^L||19781103|F",
  "",
].join("\r");

describe("hl7v2ToFhir", () => {
  it("compiles the Bundle onto the result", async () => {
    const file = await compile(message);
    const bundle = bundleOf(file);

    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("collection");
    expect(bundle.entry.map((entry) => entry.fullUrl)).toStrictEqual([
      "urn:uuid:patient-1",
      "urn:uuid:encounter-1",
    ]);
  });

  it("reports every finding on the same channel the lint rules use", async () => {
    const file = await compile(message);

    expect(file.messages.length).toBeGreaterThan(0);
    for (const finding of file.messages) {
      expect(finding.source).toBe("glion-to-fhir");
      expect(finding.ruleId).toMatch(/^fhir-/);
      expect(finding.fatal).toBe(false);
    }
  });

  it("places a field finding at the field it was found in", async () => {
    const file = await compile(message);
    const finding = file.messages.find(
      (candidate) => candidate.ruleId === "fhir-unmapped-field"
    );

    expect(finding?.line).toBe(2);
    expect(finding?.column).toBeGreaterThan(0);
  });

  it("carries the provenance and the coverage on the file data", async () => {
    const file = await compile(message);

    expect(file.data.provenance).toHaveLength(24);
    expect(file.data.fhirCoverage).toStrictEqual({
      consulted: 0,
      populated: 74,
      read: 20,
      resources: 2,
      unmapped: 54,
    });
  });

  it("reports a segment the profile could not place in its group", async () => {
    const file = await compile(ungrouped);

    expect(bundleOf(file).entry).toStrictEqual([]);
    expect(
      file.messages.find(
        (candidate) => candidate.ruleId === "fhir-scope-absent"
      )?.reason
    ).toBe(
      "Segment map `PID[Patient]` produces one resource per `PATIENT_RESULT.PATIENT` group, and the message carries `PID` outside any such group."
    );
  });

  it("rejects a faulty schema before it reads a message", async () => {
    const faulty: TranslationSchema = {
      ...oruR01,
      resources: oruR01.resources.map((rule): ResourceRule =>
        rule.anchor === "PV1"
          ? {
              ...rule,
              elements: [
                {
                  assign: "finished",
                  target: "status",
                  when: { valued: "PV1-45" },
                },
              ],
            }
          : rule
      ),
    };

    await expect(compile(message, faulty)).rejects.toThrow(
      TranslationSchemaError
    );
  });

  it("says nothing about a segment the message does not carry", async () => {
    const file = await compile(ungrouped);

    expect(
      file.messages.filter(
        (candidate) => candidate.ruleId === "fhir-scope-absent"
      )
    ).toHaveLength(1);
  });
});
