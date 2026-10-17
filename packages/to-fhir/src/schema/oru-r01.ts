import type { DatatypeRule, TranslationSchema } from "../types";
import { vocabularies } from "./vocabularies";

/**
 * CX as a FHIR Identifier.
 *
 * CX-4 (Assigning Authority) is not read: it names an Organization, and
 * `Identifier.system` takes a URI rather than a name.
 */
const cxIdentifier: DatatypeRule[] = [
  { source: "CX.1", target: "value" },
  {
    source: "CX.5",
    target: "type.coding[1].code",
    vocabulary: "IdentifierType",
  },
];

/** XPN as a FHIR HumanName. */
const xpnHumanName: DatatypeRule[] = [
  { source: "XPN.1", target: "family" },
  { source: "XPN.2", target: "given[1]" },
  { source: "XPN.3", target: "given[2]" },
  { source: "XPN.4", target: "suffix[1]" },
  { source: "XPN.5", target: "prefix[1]" },
  { source: "XPN.7", target: "use", vocabulary: "NameType" },
];

/** XAD as a FHIR Address. */
const xadAddress: DatatypeRule[] = [
  { source: "XAD.1", target: "line[1]" },
  { source: "XAD.2", target: "line[2]" },
  { source: "XAD.3", target: "city" },
  { source: "XAD.4", target: "state" },
  { source: "XAD.5", target: "postalCode" },
  { source: "XAD.6", target: "country" },
  { source: "XAD.7", target: "use", vocabulary: "AddressType[Use]" },
];

/**
 * PID and PV1 of an ORU^R01 as US Core Patient and Encounter.
 *
 * Segment maps are read from the HL7 V2-to-FHIR Implementation Guide and
 * written out here; the concept maps are the mapping's own tables.
 */
export const oruR01: TranslationSchema = {
  datatypes: {
    "CX[Identifier]": cxIdentifier,
    "XAD[Address]": xadAddress,
    "XPN[HumanName]": xpnHumanName,
  },
  fhir: "4.0.1",
  message: "ORU_R01",
  resources: [
    {
      anchor: "PID",
      elements: [
        {
          assign:
            "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient",
          target: "meta.profile[1]",
        },
        {
          datatype: "CX[Identifier]",
          each: true,
          source: "PID.3",
          target: "identifier[]",
        },
        {
          datatype: "XPN[HumanName]",
          each: true,
          source: "PID.5",
          target: "name[]",
        },
        { source: "PID.7", target: "birthDate", transform: "hl7-date" },
        { source: "PID.8", target: "gender", vocabulary: "AdministrativeSex" },
        {
          datatype: "XAD[Address]",
          each: true,
          source: "PID.11",
          target: "address[]",
        },
      ],
      map: "PID[Patient]",
      resourceType: "Patient",
      scope: "PATIENT_RESULT.PATIENT",
      slot: "Patient[1]",
    },
    {
      anchor: "PV1",
      elements: [
        {
          assign:
            "http://hl7.org/fhir/us/core/StructureDefinition/us-core-encounter",
          target: "meta.profile[1]",
        },
        {
          source: "PV1.2",
          target: "class.code",
          vocabulary: "PatientClass[EncounterClass]",
        },
        {
          datatype: "CX[Identifier]",
          each: true,
          source: "PV1.19",
          target: "identifier[]",
        },
        { source: "PV1.44", target: "period.start", transform: "hl7-datetime" },
        { source: "PV1.45", target: "period.end", transform: "hl7-datetime" },
        { assign: "finished", target: "status", when: { valued: "PV1.45" } },
        { assign: "in-progress", target: "status", when: { empty: "PV1.45" } },
      ],
      map: "PV1[Encounter]",
      references: [{ slot: "Patient[1]", target: "subject.reference" }],
      resourceType: "Encounter",
      scope: "PATIENT_RESULT.PATIENT.VISIT",
      slot: "Encounter[1]",
    },
  ],
  versions: ["2.5.1"],
  vocabularies,
};
