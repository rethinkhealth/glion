/**
 * `visit` benchmarks — the traversal every lint rule and annotation plugin
 * runs.
 *
 * Each bench walks a parsed ORU^R01 the way a caller does: every node, one
 * node type, segments only, and segments then their fields. The last is the
 * nested shape the profile lint rules use.
 */
import { parseHL7v2 } from "@glion/parser";
import { SKIP, visit } from "@glion/util-visit";
import { bench, describe } from "vitest";

import { hl7, ORU_R01_HEADER, oruObx, repeat } from "../fixtures/messages";

const tree = parseHL7v2(hl7(...ORU_R01_HEADER, ...repeat(oruObx, 200)));

describe("visit", () => {
  bench("visit: every node (ORU^R01, 205 segments)", () => {
    visit(tree, () => {});
  });

  bench("visit: fields by type (ORU^R01, 205 segments)", () => {
    visit(tree, "field", () => SKIP);
  });

  bench("visit: segments, skipping their children (ORU^R01, 205 segments)", () => {
    visit(tree, "segment", () => SKIP);
  });

  bench("visit: fields of each segment, nested (ORU^R01, 205 segments)", () => {
    visit(tree, "segment", (segment) => {
      visit(segment, "field", () => SKIP);
      return SKIP;
    });
  });
});
