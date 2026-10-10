/**
 * Regression for https://github.com/rethinkhealth/glion/issues/916.
 *
 * Date: 2026-10-10
 * Symptom: a valid v2.7.1 ADT^A01 got four findings, each checking a field
 * against the profile of another field: `EVN-1` and `PID-2` were reported
 * empty though required, `PID-3` was checked against the table of `PID-5`, and
 * `PID-5` against the datatype of `PID-7`.
 * Cause: from v2.6 on, the bundled field profiles left out the fields HL7
 * withdrew and gave every field after one the sequence of its place in the
 * list, so a lookup by sequence found the wrong field.
 * Resolution: the generator takes each field's sequence from HL7DB and keeps
 * the withdrawn fields, and the bundled data is regenerated.
 */

import { c, f, m, s } from "@glion/builder";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2PresetLintProfileRecommended from "../../src";

describe("a valid v2.7.1 ADT^A01", () => {
  it("gets no findings", async () => {
    const tree = m(
      s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f("SENDER"),
        f("FAC"),
        f("RECV"),
        f("RFAC"),
        f("20241201"),
        f(""),
        f(c("ADT"), c("A01"), c("ADT_A01")),
        f("MSG001"),
        f("P"),
        f("2.7.1")
      ),
      s("EVN", f(""), f("20241201")),
      s(
        "PID",
        f("1"),
        f(""),
        f(c("12345"), c(""), c(""), c("HOSP"), c("MR")),
        f(""),
        f(c("Doe"), c("John"))
      ),
      s("PV1", f("1"), f("I"))
    );
    const file = new VFile();

    await unified().use(hl7v2PresetLintProfileRecommended).run(tree, file);

    expect(file.messages.map(String)).toEqual([]);
  });
});
