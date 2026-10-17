import type { Nodes } from "@glion/ast";

/** The resources one HL7v2 message structure produces, and the tables they read. */
export interface TranslationSchema {
  /** HL7v2 message structure this schema translates, as MSH-9.3 spells it. */
  message: string;
  /** HL7v2 versions this schema was written against. */
  versions: string[];
  /** FHIR release the targets belong to. */
  fhir: string;
  resources: ResourceRule[];
  /** V2-datatype tables, keyed `CX[Identifier]`. */
  datatypes: Record<string, DatatypeRule[]>;
  /** Code tables, keyed by the HL7 V2-to-FHIR concept map name. */
  vocabularies: Record<string, VocabularyMap>;
}

/**
 * One FHIR resource, produced once per instance of `scope`.
 *
 * A rule whose `slot` another rule in the same scope instance has already
 * produced writes onto that resource.
 */
export interface ResourceRule {
  /** Primary Target, as the HL7 V2-to-FHIR mapping spells it: `Patient[1]`. */
  slot: string;
  resourceType: string;
  /**
   * Group path the resource is produced for, without instance indices:
   * `PATIENT_RESULT.PATIENT`. An empty string names the message itself.
   */
  scope: string;
  /** Segment ID inside `scope` the rule reads. */
  anchor: string;
  /** Segment map this rule set came from: `PID[Patient]`. */
  map: string;
  elements: ElementRule[];
  references?: ReferenceRule[];
}

/** One FHIR element, written from one HL7v2 source or from a literal. */
export interface ElementRule {
  /**
   * HL7v2 source, as a path below and including the anchor Segment ID:
   * `PID.5`, `PID.5.1`. Absent on a rule that writes `assign`.
   */
  source?: string;
  /** FHIR element path relative to the resource: `name[1].family`. */
  target: string;
  /** Datatype table the source expands through. */
  datatype?: string;
  /** Code table the value translates through. */
  vocabulary?: string;
  /** Value written with no HL7v2 source. */
  assign?: string;
  transform?: TransformName;
  when?: Condition;
  /**
   * Write one FHIR occurrence per HL7v2 field repetition. The target MUST end
   * in `[]`.
   */
  each?: boolean;
}

/** One component of a v2 datatype, appended to the element rule's target. */
export interface DatatypeRule {
  /** Component of the v2 datatype: `CX.1`, or `$value` for the field itself. */
  source: string;
  /** Target appended to the element rule's target: `type.coding[1].code`. */
  target: string;
  vocabulary?: string;
  transform?: TransformName;
}

/** One of the HL7 V2-to-FHIR concept maps, keyed by HL7v2 code. */
export interface VocabularyMap {
  /** HL7v2 table the codes come from: `HL70001`. */
  v2Table: string;
  codes: Record<string, VocabularyEntry>;
}

/**
 * What the HL7 V2-to-FHIR mapping publishes for one HL7v2 code.
 *
 * `passthrough` keeps the HL7v2 code and assigns it a `v2-NNNN` CodeSystem.
 * `declined` and `error` are codes the mapping publishes with no FHIR code.
 */
export type VocabularyEntry =
  | {
      code: string;
      system: string;
      display?: string;
      kind: "translated" | "passthrough";
    }
  | { unmapped: "declined" | "error"; text: string };

/** A FHIR element on this resource that points at one other slot. */
export interface ReferenceRule {
  target: string;
  slot: string;
}

export type TransformName = "hl7-date" | "hl7-datetime";

/** The computable subset of the mapping's Condition column. */
export type Condition = { valued: string } | { empty: string };

/** One FHIR element, and the HL7v2 leaf behind it. */
export interface ProvenanceEntry {
  /** `Patient/patient-1`. */
  resource: string;
  slot: string;
  /** FHIR element path within the resource. */
  fhir: string;
  /** Canonical path of the HL7v2 leaf, or `null` for a literal. */
  v2: string | null;
  written: string;
  /** Route the value took: `direct`, `literal`, `dt:CX[Identifier]`. */
  via: string;
}

/** A populated leaf of the message: a subcomponent that carries a value. */
export interface Leaf {
  /** Canonical `@glion/util-query` path, group-qualified. */
  path: string;
  value: string;
  node: Nodes;
  /** Segment ID the leaf sits in. */
  segment: string;
  /** Field sequence within that segment. */
  sequence: number;
  /** Field name from `@glion/annotate-profile-fields`, when the profile has one. */
  name?: string;
}

/** A FHIR Bundle of type `collection`. */
export interface FhirBundle {
  resourceType: "Bundle";
  type: "collection";
  entry: { fullUrl: string; resource: Record<string, unknown> }[];
}
