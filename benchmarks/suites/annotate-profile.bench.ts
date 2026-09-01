/**
 * Profile annotation benchmarks — the cost of enriching AST nodes with
 * profile metadata (field definitions, datatype cascade, code systems).
 *
 * Every processor includes hl7v2AnnotateProfileContext: the downstream
 * plugins read `file.data.profile` and bail without it, so a processor
 * missing it benchmarks an early return. The canary test pins this.
 *
 * The annotators mutate the tree, so each iteration runs on a fresh
 * structuredClone. The baseline bench measures that clone alone —
 * subtract it to read the annotation cost proper.
 */
import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileDatatypes } from "@glion/annotate-profile-datatypes";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import { hl7v2AnnotateProfileFieldsCodeSystems } from "@glion/annotate-profile-fields-code-systems";
import { parseHL7v2 } from "@glion/parser";
import hl7v2PresetAnnotateProfileRecommended from "@glion/preset-annotate-profile-recommended";
import { unified } from "unified";
import { VFile } from "vfile";
import { bench, describe } from "vitest";

import { hl7, hl7File, obxCodedLine, repeat } from "../fixtures/messages";

const fields = unified()
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2AnnotateProfileFields);

const fieldsAndDatatypes = unified()
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2AnnotateProfileFields)
  .use(hl7v2AnnotateProfileDatatypes);

const fieldsAndCodeSystems = unified()
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2AnnotateProfileFields)
  .use(hl7v2AnnotateProfileFieldsCodeSystems);

const preset = unified().use(hl7v2PresetAnnotateProfileRecommended);

const BASE = hl7File("adt-a01-annotate");

describe("annotate-profile", () => {
  const medium = parseHL7v2(hl7(BASE, ...repeat(obxCodedLine, 10)));
  const large = parseHL7v2(hl7(BASE, ...repeat(obxCodedLine, 50)));

  bench("annotate: baseline structuredClone (52 segments)", () => {
    structuredClone(large);
  });

  bench("annotate: fields (12 segments)", async () => {
    await fields.run(structuredClone(medium), new VFile());
  });

  bench("annotate: fields (52 segments)", async () => {
    await fields.run(structuredClone(large), new VFile());
  });

  bench("annotate: fields + datatypes (12 segments)", async () => {
    await fieldsAndDatatypes.run(structuredClone(medium), new VFile());
  });

  bench("annotate: fields + code-systems (12 segments)", async () => {
    await fieldsAndCodeSystems.run(structuredClone(medium), new VFile());
  });

  bench("annotate: full preset (12 segments)", async () => {
    await preset.run(structuredClone(medium), new VFile());
  });
});
