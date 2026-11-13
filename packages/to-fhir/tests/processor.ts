import { hl7v2AnnotateDelimiters } from "@glion/annotate-delimiters";
import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import type { Root } from "@glion/ast";
import { hl7v2DecodeEscapes } from "@glion/decode-escapes";
import { hl7v2Parser } from "@glion/parser";
import { hl7v2TransformProfileGroups } from "@glion/transform-profile-groups";
import { unified } from "unified";
import { VFile } from "vfile";

import { hl7v2ToFhir } from "../src/plugin";
import { oruR01 } from "../src/schema/oru-r01";
import type { FhirBundle, TranslationSchema } from "../src/types";

/** The plugins the compiler reads the tree from, with no FHIR step. */
export const annotated = unified()
  .use(hl7v2Parser)
  .use(hl7v2AnnotateDelimiters)
  .use(hl7v2DecodeEscapes)
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2AnnotateProfileFields)
  .use(hl7v2TransformProfileGroups)
  .freeze();

/** The grouped, field-annotated tree for a message. */
export async function toTree(message: string): Promise<Root> {
  const file = new VFile({ value: message });
  return await annotated.run(annotated.parse(file) as Root, file);
}

/** Run the whole pipeline, FHIR step included. */
export async function compile(
  message: string,
  schema: TranslationSchema = oruR01
): Promise<VFile> {
  return await unified()
    .use(hl7v2Parser)
    .use(hl7v2AnnotateDelimiters)
    .use(hl7v2DecodeEscapes)
    .use(hl7v2AnnotateProfileContext)
    .use(hl7v2AnnotateProfileFields)
    .use(hl7v2TransformProfileGroups)
    .use(hl7v2ToFhir, { schema })
    .process(message);
}

/** The Bundle a processed file carries. */
export const bundleOf = (file: VFile): FhirBundle =>
  file.result as unknown as FhirBundle;
