import { describe, expect, it } from "vitest";

import { oruR01 } from "../src/schema/oru-r01";
import type { TranslationSchema } from "../src/types";
import { compile } from "./processor";

const MSH =
  "MSH|^~\\&|LAB|CENTRAL_LAB|EHR|GENERAL_HOSPITAL|20261014093000||ORU^R01^ORU_R01|LAB20261014-7781|P|2.5.1";
const PV1 =
  "PV1|1|O|LAB^^^GENERAL_HOSPITAL||||||||||||||||V|VISIT99812^^^GENERAL_HOSPITAL|||||||||||||||||||||||||20261014080000";
const ORDER = [
  "ORC|RE|PLC-88301^EHR|FIL-55120^LAB",
  "OBR|1|PLC-88301^EHR|FIL-55120^LAB|57021-8^CBC with Differential panel^LN|||20261014081500",
];

/** An ORU^R01 the profile can group, with the given PID and PV1. */
function message(pid: string, pv1: string = PV1): string {
  return [MSH, pid, pv1, ...ORDER, ""].join("\r");
}

const reasonOf = async (
  text: string,
  ruleId: string,
  schema?: TranslationSchema
) => {
  const file = await compile(text, schema);
  return file.messages.find((candidate) => candidate.ruleId === ruleId);
};

describe("a code the concept map has no FHIR code for", () => {
  it("reports a code the HL7v2 table does not define", async () => {
    const finding = await reasonOf(
      message(
        "PID|1||MRN445566^^^GENERAL_HOSPITAL^MR||RIVERA^MARIA||19781103|Z"
      ),
      "fhir-terminology-gap"
    );

    expect(finding?.reason).toBe(
      "Field `PATIENT_RESULT[1].PATIENT[1].PID.8.1.1` carries `Z`, which HL7v2 table `HL70001` does not define."
    );
    expect(finding?.actual).toBe("Z");
    expect(finding?.expected).toStrictEqual(["A", "F", "M", "N", "O", "U"]);
  });

  it("reports a code the HL7 V2-to-FHIR mapping declines", async () => {
    const finding = await reasonOf(
      message(
        "PID|1||MRN445566^^^GENERAL_HOSPITAL^MR||RIVERA^MARIA||19781103|F|||742 BIRCHWOOD LN^^AUSTIN^TX^78702^USA^BDL"
      ),
      "fhir-terminology-gap"
    );

    expect(finding?.reason).toBe(
      "Field `PATIENT_RESULT[1].PATIENT[1].PID.11.7.1` carries `BDL` from HL7v2 table `HL70190`, which the HL7 V2-to-FHIR mapping publishes with no FHIR code."
    );
    expect(finding?.note).toBe(
      "Birth delivery location  (address where birth occurred)"
    );
  });

  it("reports a code the HL7 V2-to-FHIR mapping requires an error for", async () => {
    const schema: TranslationSchema = {
      ...oruR01,
      vocabularies: {
        ...oruR01.vocabularies,
        AdministrativeSex: {
          codes: {
            ...oruR01.vocabularies.AdministrativeSex?.codes,
            F: { text: "Female", unmapped: "error" },
          },
          v2Table: "HL70001",
        },
      },
    };
    const finding = await reasonOf(
      message(
        "PID|1||MRN445566^^^GENERAL_HOSPITAL^MR||RIVERA^MARIA||19781103|F"
      ),
      "fhir-terminology-gap",
      schema
    );

    expect(finding?.reason).toBe(
      "Field `PATIENT_RESULT[1].PATIENT[1].PID.8.1.1` carries `F` from HL7v2 table `HL70001`, for which the HL7 V2-to-FHIR mapping requires an error."
    );
  });
});

describe("a value a conversion cannot read", () => {
  it("reports a date/time in a field the mapping converts as a date", async () => {
    const finding = await reasonOf(
      message(
        "PID|1||MRN445566^^^GENERAL_HOSPITAL^MR||RIVERA^MARIA||19781103000000|F"
      ),
      "fhir-conversion-failure"
    );

    expect(finding?.reason).toBe(
      "Field `PATIENT_RESULT[1].PATIENT[1].PID.7.1.1` carries `19781103000000`, which is not an HL7v2 date; an HL7v2 date is `YYYY`, `YYYYMM` or `YYYYMMDD`."
    );
    expect(finding?.actual).toBe("19781103000000");
  });

  it("reports a value too short to carry a date/time", async () => {
    const finding = await reasonOf(
      message(
        "PID|1||MRN445566^^^GENERAL_HOSPITAL^MR||RIVERA^MARIA||19781103|F",
        "PV1|1|O|LAB^^^GENERAL_HOSPITAL||||||||||||||||V|VISIT99812^^^GENERAL_HOSPITAL|||||||||||||||||||||||||202610"
      ),
      "fhir-conversion-failure"
    );

    expect(finding?.reason).toBe(
      "Field `PATIENT_RESULT[1].PATIENT[1].VISIT[1].PV1.45.1.1` carries `202610`, which is not an HL7v2 date/time; an HL7v2 date/time begins `YYYYMMDD` and may continue `HHMM` or `HHMMSS`."
    );
  });
});

describe("a populated field the mapping does not read", () => {
  it("names the field when HL7v2 names it", async () => {
    const finding = await reasonOf(
      message(
        "PID|1||MRN445566^^^GENERAL_HOSPITAL^MR||RIVERA^MARIA||19781103|F"
      ),
      "fhir-unmapped-field"
    );

    expect(finding?.reason).toBe(
      "Field `PATIENT_RESULT[1].PATIENT[1].PID.1.1.1` (Set ID - PID) carries `1`, and no element of the mapping reads it."
    );
  });

  it("says only the path for a field beyond the ones HL7v2 defines", async () => {
    const file = await compile(
      message(
        `PID|1||MRN445566^^^GENERAL_HOSPITAL^MR||RIVERA^MARIA||19781103|F${"|".repeat(32)}LOCAL-EXT`
      )
    );
    const finding = file.messages.find((candidate) =>
      candidate.reason.includes("PID.40")
    );

    expect(finding?.reason).toBe(
      "Field `PATIENT_RESULT[1].PATIENT[1].PID.40.1.1` carries `LOCAL-EXT`, and no element of the mapping reads it."
    );
    expect(finding?.ruleId).toBe("fhir-unmapped-field");
  });
});
