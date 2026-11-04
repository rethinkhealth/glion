import type { ElementRule, ResourceRule, TranslationSchema } from "./types";

const SOURCE = /^([A-Z][A-Z0-9]{2})((?:\.\d+)+)$/;
const ROW_SOURCE = /^[A-Z]{2,3}\.\d+$/;
const TARGET =
  /^[A-Za-z][A-Za-z0-9]*(?:\[\d+])?(?:\.[A-Za-z][A-Za-z0-9]*(?:\[\d+])?)*$/;
const REPEATING_TARGET = /\[]$/;

/** The complete sentence each schema fault is raised with. */
const faults = {
  rowSourceNotComponent: (map: string, rowSource: string) =>
    `Datatype map \`${map}\` reads \`${rowSource}\`, which is not one component of a datatype; a row reads one component, as in \`CX.1\`, or \`$value\` for the field itself.`,
  sourceNotUnderAnchor: (map: string, source: string, anchor: string) =>
    `Segment map \`${map}\` reads \`${source}\`, which is not a path under its anchor segment \`${anchor}\`; a source is the Segment ID followed by the field sequence, as in \`${anchor}.5\`.`,
  targetNotElementPath: (map: string, target: string) =>
    `Segment map \`${map}\` writes \`${target}\`, which is not a FHIR element path.`,
  unknownDatatype: (map: string, datatype: string) =>
    `Segment map \`${map}\` names datatype map \`${datatype}\`, which the schema does not define.`,
  unknownVocabulary: (map: string, vocabulary: string) =>
    `Segment map \`${map}\` names concept map \`${vocabulary}\`, which the schema does not define.`,
  withoutRepeatingTarget: (map: string, target: string) =>
    `Segment map \`${map}\` writes one FHIR occurrence per HL7v2 field repetition into \`${target}\`; a repeating target ends with \`[]\`.`,
} as const;

export type TranslationSchemaFault = keyof typeof faults;

/** A fault in a translation schema, found before any message is read. */
export class TranslationSchemaError extends Error {
  readonly code: TranslationSchemaFault;
  /** Segment map or datatype map the fault was found in. */
  readonly map: string;

  constructor(code: TranslationSchemaFault, map: string, message: string) {
    super(message);
    this.name = "TranslationSchemaError";
    this.code = code;
    this.map = map;
  }
}

/** Every HL7v2 source one element rule reads, its condition included. */
function sourcesOf(element: ElementRule): string[] {
  const condition = element.when;
  if (condition === undefined) {
    return element.source === undefined ? [] : [element.source];
  }
  const read = "valued" in condition ? condition.valued : condition.empty;
  return element.source === undefined ? [read] : [element.source, read];
}

function checkTarget(rule: ResourceRule, element: ElementRule): void {
  const bare = element.target.replace(REPEATING_TARGET, "");
  if (!TARGET.test(bare)) {
    throw new TranslationSchemaError(
      "targetNotElementPath",
      rule.map,
      faults.targetNotElementPath(rule.map, element.target)
    );
  }
  if (element.each && !REPEATING_TARGET.test(element.target)) {
    throw new TranslationSchemaError(
      "withoutRepeatingTarget",
      rule.map,
      faults.withoutRepeatingTarget(rule.map, element.target)
    );
  }
}

function checkTables(
  rule: ResourceRule,
  element: ElementRule,
  schema: TranslationSchema
): void {
  const { datatype, vocabulary } = element;
  if (datatype !== undefined && schema.datatypes[datatype] === undefined) {
    throw new TranslationSchemaError(
      "unknownDatatype",
      rule.map,
      faults.unknownDatatype(rule.map, datatype)
    );
  }
  if (
    vocabulary !== undefined &&
    schema.vocabularies[vocabulary] === undefined
  ) {
    throw new TranslationSchemaError(
      "unknownVocabulary",
      rule.map,
      faults.unknownVocabulary(rule.map, vocabulary)
    );
  }
}

function checkElement(
  rule: ResourceRule,
  element: ElementRule,
  schema: TranslationSchema
): void {
  checkTarget(rule, element);
  for (const source of sourcesOf(element)) {
    const parsed = SOURCE.exec(source);
    if (!parsed || parsed[1] !== rule.anchor) {
      throw new TranslationSchemaError(
        "sourceNotUnderAnchor",
        rule.map,
        faults.sourceNotUnderAnchor(rule.map, source, rule.anchor)
      );
    }
  }
  checkTables(rule, element, schema);
}

/**
 * Check a translation schema before it reads a message.
 *
 * @throws {TranslationSchemaError} On the first fault found.
 */
export function assertSchema(schema: TranslationSchema): void {
  for (const rule of schema.resources) {
    for (const element of rule.elements) {
      checkElement(rule, element, schema);
    }
  }
  for (const [map, rows] of Object.entries(schema.datatypes)) {
    for (const row of rows) {
      if (row.source !== "$value" && !ROW_SOURCE.test(row.source)) {
        throw new TranslationSchemaError(
          "rowSourceNotComponent",
          map,
          faults.rowSourceNotComponent(map, row.source)
        );
      }
      if (
        row.vocabulary !== undefined &&
        schema.vocabularies[row.vocabulary] === undefined
      ) {
        throw new TranslationSchemaError(
          "unknownVocabulary",
          map,
          faults.unknownVocabulary(map, row.vocabulary)
        );
      }
    }
  }
}
