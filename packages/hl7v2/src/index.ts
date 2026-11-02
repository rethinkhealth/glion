import { hl7v2Jsonify } from "@glion/jsonify";
import { hl7v2Parser } from "@glion/parser";
import hl7v2PresetLintProfileRecommended from "@glion/preset-lint-profile-recommended";
import hl7v2PresetLintRecommended from "@glion/preset-lint-recommended";
import { unified } from "unified";

/**
 * Create a new unified processor that already uses `hl7v2-parser`.
 */
export const parseHL7v2 = unified()
  .use(hl7v2Parser)
  .use(hl7v2PresetLintRecommended)
  .use(hl7v2PresetLintProfileRecommended)
  .use(hl7v2Jsonify)
  .freeze();
