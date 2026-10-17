import { readFileSync } from "node:fs";

import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import { translate } from "../src/engine";
import { indexPaths, isDelimiterLeaf } from "../src/paths";
import { oruR01 } from "../src/schema/oru-r01";
import type { ResourceRule, TranslationSchema } from "../src/types";
import { bundleOf, compile, toTree } from "./processor";

const message = readFileSync(
  new URL("fixtures/oru-r01.hl7", import.meta.url),
  "utf8"
);
const twoNotes = readFileSync(
  new URL("fixtures/oru-r01-two-patient-notes.hl7", import.meta.url),
  "utf8"
);

/** The fixture message, with `value` in the named field of its PV1. */
function withPv1Field(sequence: number, value: string): string {
  return message
    .split("\n")
    .map((line) => {
      if (!line.startsWith("PV1|")) {
        return line;
      }
      const fields = line.split("|");
      fields[sequence] = value;
      return fields.join("|");
    })
    .join("\n");
}

const resourceOf = (
  bundle: { entry: { resource: Record<string, unknown> }[] },
  type: string
) =>
  bundle.entry.find((entry) => entry.resource.resourceType === type)?.resource;

describe("PID as a US Core Patient", () => {
  it("writes one identifier per HL7v2 field repetition", async () => {
    const patient = resourceOf(bundleOf(await compile(message)), "Patient");

    expect(patient?.identifier).toStrictEqual([
      {
        type: {
          coding: [
            {
              code: "MR",
              system: "http://terminology.hl7.org/CodeSystem/v2-0203",
            },
          ],
        },
        value: "MRN445566",
      },
      {
        type: {
          coding: [
            {
              code: "SS",
              system: "http://terminology.hl7.org/CodeSystem/v2-0203",
            },
          ],
        },
        value: "998877665",
      },
    ]);
  });

  it("writes the components of one XPN as one HumanName", async () => {
    const patient = resourceOf(bundleOf(await compile(message)), "Patient");

    expect(patient?.name).toStrictEqual([
      { family: "RIVERA", given: ["MARIA", "ELENA"], use: "official" },
    ]);
  });

  it("converts PID-7 to the precision the HL7v2 value carries", async () => {
    const patient = resourceOf(bundleOf(await compile(message)), "Patient");

    expect(patient?.birthDate).toBe("1978-11-03");
  });

  it("translates PID-8 through the concept map", async () => {
    const patient = resourceOf(bundleOf(await compile(message)), "Patient");

    expect(patient?.gender).toBe("female");
  });

  it("leaves no hole in an array where a component is empty", async () => {
    const patient = resourceOf(bundleOf(await compile(message)), "Patient");

    expect(patient?.address).toStrictEqual([
      {
        city: "AUSTIN",
        country: "USA",
        line: ["742 BIRCHWOOD LN", "APT 4B"],
        postalCode: "78702",
        state: "TX",
        use: "home",
      },
    ]);
  });
});

describe("PV1 as a US Core Encounter", () => {
  it("writes the CodeSystem of a translated code beside it", async () => {
    const encounter = resourceOf(bundleOf(await compile(message)), "Encounter");

    expect(encounter?.class).toStrictEqual({
      code: "AMB",
      system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
    });
  });

  it("reads PV1-45 to decide the status, and finds it empty", async () => {
    const encounter = resourceOf(bundleOf(await compile(message)), "Encounter");

    expect(encounter?.status).toBe("in-progress");
    expect(encounter?.period).toStrictEqual({ start: "2026-10-14T08:00:00" });
  });

  it("points at the Patient of the enclosing group", async () => {
    const encounter = resourceOf(bundleOf(await compile(message)), "Encounter");

    expect(encounter?.subject).toStrictEqual({
      reference: "Patient/patient-1",
    });
  });
});

describe("coverage", () => {
  it("accounts for every populated leaf exactly once", async () => {
    const file = await compile(message);
    const coverage = file.data.fhirCoverage;

    expect(coverage?.populated).toBe(
      coverage!.read + coverage!.consulted + coverage!.unmapped
    );
  });

  it("counts every leaf but the delimiters HL7v2 declares in MSH", async () => {
    const file = await compile(message);
    const index = indexPaths(await toTree(message));
    const content = index.leaves.filter((leaf) => !isDelimiterLeaf(leaf));

    expect(file.data.fhirCoverage?.populated).toBe(content.length);
    expect(index.leaves.length - content.length).toBe(2);
  });

  it("reports a populated field of a mapped segment that no element reads", async () => {
    const file = await compile(message);
    const finding = file.messages.find(
      (candidate) => candidate.ruleId === "fhir-unmapped-field"
    );

    expect(finding?.reason).toBe(
      "Field `PATIENT_RESULT[1].PATIENT[1].PID.1.1.1` (Set ID - PID) carries `1`, and no element of the mapping reads it."
    );
    expect(finding?.actual).toBe("1");
    expect(finding?.source).toBe("glion-to-fhir");
  });

  it("reports a segment with no segment map once, with its value count", async () => {
    const file = await compile(message);
    const finding = file.messages.find(
      (candidate) =>
        candidate.ruleId === "fhir-unmapped-segment" &&
        candidate.reason.includes("`OBX`")
    );

    expect(finding?.reason).toBe(
      "Segment `OBX` carries 12 values, and the mapping has no segment map for it."
    );
  });

  it("records the provenance of every element written", async () => {
    const file = await compile(message);
    const written = file.data.provenance ?? [];

    expect(written).toContainEqual({
      fhir: "gender",
      resource: "Patient/patient-1",
      slot: "Patient[1]",
      v2: "PATIENT_RESULT[1].PATIENT[1].PID.8.1.1",
      via: "direct + vocab:AdministrativeSex",
      written: "female",
    });
    expect(written).toContainEqual({
      fhir: "subject.reference",
      resource: "Encounter/encounter-1",
      slot: "Encounter[1]",
      v2: null,
      via: "reference:Patient[1]",
      written: "Patient/patient-1",
    });
  });
});

describe("references", () => {
  /** The shipped schema, with the Patient pointed at the Encounter below it. */
  const inverted: TranslationSchema = {
    ...oruR01,
    resources: oruR01.resources.map((rule): ResourceRule =>
      rule.anchor === "PID"
        ? {
            ...rule,
            references: [
              {
                slot: "Encounter[1]",
                target: "managingOrganization.reference",
              },
            ],
          }
        : rule
    ),
  };

  it("declines a slot filled only in a group below the referring resource", async () => {
    const file = new VFile({ value: message });
    const bundle = translate(await toTree(message), inverted, file);
    const patient = resourceOf(bundle, "Patient");

    expect(patient?.managingOrganization).toBeUndefined();
    expect(
      file.messages.find(
        (candidate) => candidate.ruleId === "fhir-unresolved-reference"
      )?.reason
    ).toBe(
      "The `managingOrganization.reference` element of `Patient` points at `Encounter[1]`, which no resource in an enclosing group fills."
    );
  });

  it("declines a slot no segment map fills", async () => {
    const file = new VFile({ value: message });
    const missing: TranslationSchema = {
      ...oruR01,
      resources: oruR01.resources.map((rule): ResourceRule =>
        rule.anchor === "PV1"
          ? {
              ...rule,
              references: [
                ...(rule.references ?? []),
                {
                  slot: "Practitioner[1]",
                  target: "participant[1].individual.reference",
                },
              ],
            }
          : rule
      ),
    };
    translate(await toTree(message), missing, file);

    expect(
      file.messages.find(
        (candidate) => candidate.ruleId === "fhir-unresolved-reference"
      )?.reason
    ).toBe(
      "The `participant[1].individual.reference` element of `Encounter` points at `Practitioner[1]`, which no resource in an enclosing group fills."
    );
  });
});

describe("a repeated anchor in one group instance", () => {
  /** The shipped schema, plus a resource anchored on the repeating NTE. */
  const withNote: TranslationSchema = {
    ...oruR01,
    resources: [
      ...oruR01.resources,
      {
        anchor: "NTE",
        elements: [{ source: "NTE.3", target: "payload[1].contentString" }],
        map: "NTE[Communication]",
        resourceType: "Communication",
        scope: "PATIENT_RESULT.PATIENT",
        slot: "Communication[1]",
      },
    ],
  };

  it("writes one resource and reports the second segment", async () => {
    const file = new VFile({ value: twoNotes });
    const bundle = translate(await toTree(twoNotes), withNote, file);
    const communications = bundle.entry.filter(
      (entry) => entry.resource.resourceType === "Communication"
    );

    expect(communications).toHaveLength(1);
    expect(
      file.messages.find(
        (candidate) => candidate.ruleId === "fhir-duplicate-anchor"
      )?.reason
    ).toBe(
      "A second `NTE` segment in one group would write `Communication[1]` again; the mapping produces one `Communication[1]` resource per group instance."
    );
  });
});

describe("a reference with more than one candidate", () => {
  /**
   * The shipped schema, plus a Communication anchored on the NTE of the
   * PATIENT group and pointed at `Patient[1]`, which both the message and the
   * PATIENT group fill.
   */
  const twoPatients: TranslationSchema = {
    ...oruR01,
    resources: [
      {
        anchor: "MSH",
        elements: [{ source: "MSH.10", target: "identifier[1].value" }],
        map: "MSH[Patient]",
        resourceType: "Patient",
        scope: "",
        slot: "Patient[1]",
      },
      ...oruR01.resources,
    ],
  };

  it("points at the resource in the nearest enclosing group", async () => {
    const file = new VFile({ value: message });
    const bundle = translate(await toTree(message), twoPatients, file);
    const encounter = resourceOf(bundle, "Encounter");
    const patients = bundle.entry.filter(
      (entry) => entry.resource.resourceType === "Patient"
    );

    expect(patients).toHaveLength(2);
    expect(encounter?.subject).toStrictEqual({
      reference: "Patient/patient-2",
    });
  });
});

describe("a resource that points at its own slot", () => {
  /** The shipped schema, with the Encounter pointed at `Encounter[1]`. */
  const selfReferring: TranslationSchema = {
    ...oruR01,
    resources: oruR01.resources.map((rule): ResourceRule =>
      rule.anchor === "PV1"
        ? {
            ...rule,
            references: [{ slot: "Encounter[1]", target: "partOf.reference" }],
          }
        : rule
    ),
  };

  it("declines to point a resource at itself", async () => {
    const file = new VFile({ value: message });
    const bundle = translate(await toTree(message), selfReferring, file);

    expect(resourceOf(bundle, "Encounter")?.partOf).toBeUndefined();
    expect(
      file.messages.find(
        (candidate) => candidate.ruleId === "fhir-unresolved-reference"
      )?.reason
    ).toBe(
      "The `partOf.reference` element of `Encounter` points at `Encounter[1]`, which no resource in an enclosing group fills."
    );
  });
});

describe("a condition the message satisfies", () => {
  const discharged = withPv1Field(45, "20261014163000");

  it("reads the field the condition names", async () => {
    const encounter = resourceOf(
      bundleOf(await compile(discharged)),
      "Encounter"
    );

    expect(encounter?.status).toBe("finished");
    expect(encounter?.period).toStrictEqual({
      end: "2026-10-14T16:30:00",
      start: "2026-10-14T08:00:00",
    });
  });

  it("counts a field a condition read and an element wrote as read", async () => {
    const file = await compile(discharged);
    const coverage = file.data.fhirCoverage;

    expect(coverage?.consulted).toBe(0);
    expect(coverage?.populated).toBe(
      coverage!.read + coverage!.consulted + coverage!.unmapped
    );
  });
});

describe("a field only a condition reads", () => {
  /**
   * The shipped schema, with the status decided by PV1-36, which nothing
   * writes.
   */
  const byDisposition: TranslationSchema = {
    ...oruR01,
    resources: oruR01.resources.map((rule): ResourceRule =>
      rule.anchor === "PV1"
        ? {
            ...rule,
            elements: [
              ...rule.elements.filter((element) => element.when === undefined),
              {
                assign: "finished",
                target: "status",
                when: { valued: "PV1.36" },
              },
            ],
          }
        : rule
    ),
  };

  it("counts the field as consulted, and reports it as neither read nor unmapped", async () => {
    const file = await compile(withPv1Field(36, "01"), byDisposition);
    const coverage = file.data.fhirCoverage;

    expect(resourceOf(bundleOf(file), "Encounter")?.status).toBe("finished");
    expect(coverage?.consulted).toBe(1);
    expect(coverage?.populated).toBe(
      coverage!.read + coverage!.consulted + coverage!.unmapped
    );
    expect(
      file.messages.filter((candidate) => candidate.reason.includes("PV1.36"))
    ).toStrictEqual([]);
  });
});

describe("a value a conversion cannot read", () => {
  it("writes no element, rather than the value it could not convert", async () => {
    const file = await compile(
      message.replace("|19781103|F", "|19781103000000|F")
    );
    const patient = resourceOf(bundleOf(file), "Patient");

    expect(patient?.birthDate).toBeUndefined();
    expect(patient?.gender).toBe("female");
  });
});

describe("a code the concept map has no FHIR code for", () => {
  it("writes no element, rather than the HL7v2 code", async () => {
    const file = await compile(message.replace("|19781103|F", "|19781103|Z"));
    const patient = resourceOf(bundleOf(file), "Patient");

    expect(patient?.gender).toBeUndefined();
    expect(patient?.birthDate).toBe("1978-11-03");
  });
});

describe("a group instance carrying more than one Segment ID", () => {
  /** The shipped schema, with the Patient anchored on the NTE beside PID. */
  const anchoredOnNote: TranslationSchema = {
    ...oruR01,
    resources: oruR01.resources.map((rule): ResourceRule =>
      rule.anchor === "PID"
        ? {
            ...rule,
            anchor: "NTE",
            elements: [{ source: "NTE.3", target: "name[1].text" }],
          }
        : rule
    ),
  };

  it("reads the anchor segment and no other segment of the group", async () => {
    const file = new VFile({ value: twoNotes });
    const bundle = translate(await toTree(twoNotes), anchoredOnNote, file);

    expect(resourceOf(bundle, "Patient")?.name).toStrictEqual([
      { text: "Patient requests results be released by telephone." },
    ]);
  });
});

describe("an element a rule declined to write", () => {
  const unknownTypes = message.replace(
    "MRN445566^^^GENERAL_HOSPITAL^MR~998877665^^^USA^SS",
    "MRN445566^^^GENERAL_HOSPITAL^MR~998877665^^^USA^ZZ~^^^^ZZ"
  );

  it("leaves no empty object where the code was to go", async () => {
    const patient = resourceOf(
      bundleOf(await compile(unknownTypes)),
      "Patient"
    );

    expect(patient?.identifier).toStrictEqual([
      {
        type: {
          coding: [
            {
              code: "MR",
              system: "http://terminology.hl7.org/CodeSystem/v2-0203",
            },
          ],
        },
        value: "MRN445566",
      },
      { value: "998877665" },
    ]);
  });

  it("drops a repetition that carries nothing the mapping could write", async () => {
    const file = await compile(unknownTypes);
    const patient = resourceOf(bundleOf(file), "Patient");

    expect(patient?.identifier).toHaveLength(2);
    expect(
      file.messages.filter(
        (candidate) => candidate.ruleId === "fhir-terminology-gap"
      )
    ).toHaveLength(2);
  });
});

describe("a datatype row that reads the whole field", () => {
  /** The shipped schema, with PID-8 read through a one-row datatype map. */
  const throughDatatype: TranslationSchema = {
    ...oruR01,
    datatypes: {
      ...oruR01.datatypes,
      "IS[Code]": [
        { source: "$value", target: "$value", vocabulary: "AdministrativeSex" },
      ],
    },
    resources: oruR01.resources.map((rule): ResourceRule =>
      rule.anchor === "PID"
        ? {
            ...rule,
            elements: rule.elements.map((element) =>
              element.source === "PID.8"
                ? { datatype: "IS[Code]", source: "PID.8", target: "gender" }
                : element
            ),
          }
        : rule
    ),
  };

  it("writes the element the rule names, with no component step", async () => {
    const file = new VFile({ value: message });
    const bundle = translate(await toTree(message), throughDatatype, file);

    expect(resourceOf(bundle, "Patient")?.gender).toBe("female");
    expect(file.data.provenance).toContainEqual({
      fhir: "gender",
      resource: "Patient/patient-1",
      slot: "Patient[1]",
      v2: "PATIENT_RESULT[1].PATIENT[1].PID.8.1.1",
      via: "dt:IS[Code] + vocab:AdministrativeSex",
      written: "female",
    });
  });
});

describe("an element with no HL7v2 source", () => {
  it("records a literal as written from no field", async () => {
    const file = await compile(message);

    expect(file.data.provenance).toContainEqual({
      fhir: "meta.profile[1]",
      resource: "Patient/patient-1",
      slot: "Patient[1]",
      v2: null,
      via: "literal",
      written:
        "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient",
    });
  });

  it("writes nothing for an element that names no value at all", async () => {
    /** The shipped schema, with an Encounter element that names no value. */
    const silent: TranslationSchema = {
      ...oruR01,
      resources: oruR01.resources.map((rule): ResourceRule =>
        rule.anchor === "PV1"
          ? { ...rule, elements: [{ target: "text" }] }
          : rule
      ),
    };
    const file = new VFile({ value: message });
    const bundle = translate(await toTree(message), silent, file);

    expect(resourceOf(bundle, "Encounter")).toStrictEqual({
      resourceType: "Encounter",
      subject: { reference: "Patient/patient-1" },
    });
  });
});

describe("the provenance of a datatype expansion", () => {
  it("names the datatype map the value came through", async () => {
    const file = await compile(message);

    expect(file.data.provenance).toContainEqual({
      fhir: "name[1].family",
      resource: "Patient/patient-1",
      slot: "Patient[1]",
      v2: "PATIENT_RESULT[1].PATIENT[1].PID.5.1.1",
      via: "dt:XPN[HumanName]",
      written: "RIVERA",
    });
  });
});

describe("two segment maps that fill one slot", () => {
  /** The shipped schema, with the NTE beside PID also writing `Patient[1]`. */
  const alsoFromNote: TranslationSchema = {
    ...oruR01,
    resources: [
      ...oruR01.resources,
      {
        anchor: "NTE",
        elements: [{ source: "NTE.3", target: "text.div" }],
        map: "NTE[Patient]",
        resourceType: "Patient",
        scope: "PATIENT_RESULT.PATIENT",
        slot: "Patient[1]",
      },
    ],
  };

  it("writes one resource both maps contribute to", async () => {
    const file = new VFile({ value: twoNotes });
    const bundle = translate(await toTree(twoNotes), alsoFromNote, file);
    const patients = bundle.entry.filter(
      (entry) => entry.resource.resourceType === "Patient"
    );

    expect(patients).toHaveLength(1);
    expect(patients[0]?.resource.birthDate).toBe("1978-11-03");
    expect(patients[0]?.resource.text).toStrictEqual({
      div: "Patient requests results be released by telephone.",
    });
  });
});
