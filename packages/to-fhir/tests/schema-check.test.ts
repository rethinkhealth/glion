import { describe, expect, it } from "vitest";

import { assertSchema, TranslationSchemaError } from "../src/schema-check";
import { oruR01 } from "../src/schema/oru-r01";
import type { ElementRule, TranslationSchema } from "../src/types";

/** The shipped schema with one element rule of `PV1[Encounter]` replaced. */
function withEncounterElement(element: ElementRule): TranslationSchema {
  return {
    ...oruR01,
    resources: oruR01.resources.map((rule) =>
      rule.anchor === "PV1" ? { ...rule, elements: [element] } : rule
    ),
  };
}

/**
 * The `code` and `map` of the fault `schema` carries, or undefined when it has
 * none.
 */
function faultOf(
  schema: TranslationSchema
): { code: string; map: string } | undefined {
  try {
    assertSchema(schema);
    return undefined;
  } catch (error) {
    const fault = error as TranslationSchemaError;
    return { code: fault.code, map: fault.map };
  }
}

describe("assertSchema", () => {
  it("accepts the shipped ORU^R01 schema", () => {
    expect(() => assertSchema(oruR01)).not.toThrow();
  });

  it("rejects a source written with the HL7v2 printed form", () => {
    const schema = withEncounterElement({
      assign: "finished",
      target: "status",
      when: { valued: "PV1-45" },
    });

    expect(() => assertSchema(schema)).toThrow(
      "Segment map `PV1[Encounter]` reads `PV1-45`, which is not a path under its anchor segment `PV1`; a source is the Segment ID followed by the field sequence, as in `PV1.5`."
    );
    expect(faultOf(schema)).toStrictEqual({
      code: "sourceNotUnderAnchor",
      map: "PV1[Encounter]",
    });
  });

  it("rejects a source that belongs to another segment", () => {
    const schema = withEncounterElement({
      source: "PID.7",
      target: "period.start",
      transform: "hl7-date",
    });

    expect(() => assertSchema(schema)).toThrow(
      "Segment map `PV1[Encounter]` reads `PID.7`, which is not a path under its anchor segment `PV1`; a source is the Segment ID followed by the field sequence, as in `PV1.5`."
    );
    expect(faultOf(schema)).toStrictEqual({
      code: "sourceNotUnderAnchor",
      map: "PV1[Encounter]",
    });
  });

  it("rejects one occurrence per repetition written to a single target", () => {
    const schema = withEncounterElement({
      datatype: "CX[Identifier]",
      each: true,
      source: "PV1.19",
      target: "identifier",
    });

    expect(() => assertSchema(schema)).toThrow(
      "Segment map `PV1[Encounter]` writes one FHIR occurrence per HL7v2 field repetition into `identifier`; a repeating target ends with `[]`."
    );
    expect(faultOf(schema)).toStrictEqual({
      code: "withoutRepeatingTarget",
      map: "PV1[Encounter]",
    });
  });

  it("rejects a datatype map the schema does not define", () => {
    const schema = withEncounterElement({
      datatype: "XCN[Practitioner]",
      source: "PV1.7",
      target: "participant[1].individual",
    });

    expect(() => assertSchema(schema)).toThrow(
      "Segment map `PV1[Encounter]` names datatype map `XCN[Practitioner]`, which the schema does not define."
    );
    expect(faultOf(schema)).toStrictEqual({
      code: "unknownDatatype",
      map: "PV1[Encounter]",
    });
  });

  it("rejects a concept map the schema does not define", () => {
    const schema = withEncounterElement({
      source: "PV1.2",
      target: "class.code",
      vocabulary: "PatientClass",
    });

    expect(() => assertSchema(schema)).toThrow(
      "Segment map `PV1[Encounter]` names concept map `PatientClass`, which the schema does not define."
    );
    expect(faultOf(schema)).toStrictEqual({
      code: "unknownVocabulary",
      map: "PV1[Encounter]",
    });
  });

  it("rejects a datatype row that reads more than one component", () => {
    const schema: TranslationSchema = {
      ...oruR01,
      datatypes: {
        ...oruR01.datatypes,
        "CX[Identifier]": [{ source: "CX.1.1", target: "value" }],
      },
    };

    expect(() => assertSchema(schema)).toThrow(
      "Datatype map `CX[Identifier]` reads `CX.1.1`, which is not one component of a datatype; a row reads one component, as in `CX.1`, or `$value` for the field itself."
    );
    expect(faultOf(schema)).toStrictEqual({
      code: "rowSourceNotComponent",
      map: "CX[Identifier]",
    });
  });

  it("rejects a target that is not a FHIR element path", () => {
    const schema = withEncounterElement({
      source: "PV1.2",
      target: "class..code",
    });

    expect(() => assertSchema(schema)).toThrow(
      "Segment map `PV1[Encounter]` writes `class..code`, which is not a FHIR element path."
    );
    expect(faultOf(schema)).toStrictEqual({
      code: "targetNotElementPath",
      map: "PV1[Encounter]",
    });
  });

  it("rejects a concept map a datatype row names and the schema does not define", () => {
    const schema: TranslationSchema = {
      ...oruR01,
      datatypes: {
        ...oruR01.datatypes,
        "CX[Identifier]": [
          {
            source: "CX.5",
            target: "type.coding[1].code",
            vocabulary: "CheckDigit",
          },
        ],
      },
    };

    expect(() => assertSchema(schema)).toThrow(
      "Segment map `CX[Identifier]` names concept map `CheckDigit`, which the schema does not define."
    );
  });

  it("checks the source an element reads beside the one its condition reads", () => {
    const schema = withEncounterElement({
      source: "PV1.44",
      target: "period.start",
      when: { valued: "PV1-45" },
    });

    expect(faultOf(schema)?.code).toBe("sourceNotUnderAnchor");
  });

  it("names the fault and the map it was found in", () => {
    const schema = withEncounterElement({
      assign: "finished",
      target: "status",
      when: { valued: "PV1-45" },
    });

    try {
      assertSchema(schema);
      expect.unreachable("the schema has a fault");
    } catch (error) {
      expect(error).toBeInstanceOf(TranslationSchemaError);
      expect((error as TranslationSchemaError).code).toBe(
        "sourceNotUnderAnchor"
      );
      expect((error as TranslationSchemaError).map).toBe("PV1[Encounter]");
    }
  });
});
