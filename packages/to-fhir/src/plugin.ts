import type { Nodes, Root } from "@glion/ast";
import type { Processor } from "unified";
import type { VFile } from "vfile";

import { translate } from "./engine";
import { assertSchema } from "./schema-check";
import type { FhirBundle, ProvenanceEntry, TranslationSchema } from "./types";

declare module "vfile" {
  interface DataMap {
    /** Every FHIR element written, and the HL7v2 leaf behind it. */
    provenance: ProvenanceEntry[];
    /** What the message carried, and how much of it reached FHIR. */
    fhirCoverage: {
      /** Populated leaves, excluding MSH-1 and MSH-2. */
      populated: number;
      read: number;
      /** Leaves read only to decide a condition. */
      consulted: number;
      unmapped: number;
      resources: number;
    };
  }
}

export interface Hl7v2ToFhirOptions {
  schema: TranslationSchema;
}

/**
 * Compile the message into a FHIR Bundle on `file.result`.
 *
 * Findings go to `file.messages`; provenance and coverage go to `file.data`.
 * MUST run after the tree has been grouped and field-annotated.
 *
 * @throws {TranslationSchemaError} On a fault in `options.schema`.
 */
export function hl7v2ToFhir(
  this: Processor,
  options: Hl7v2ToFhirOptions
): undefined {
  assertSchema(options.schema);

  const self = this as unknown as Processor<
    Nodes,
    undefined,
    undefined,
    Root,
    undefined
  >;

  function compiler(tree: Root, file: VFile): FhirBundle {
    return translate(tree, options.schema, file);
  }

  self.compiler = compiler as unknown as typeof self.compiler;
}
