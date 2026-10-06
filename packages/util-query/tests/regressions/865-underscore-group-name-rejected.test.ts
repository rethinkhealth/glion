/**
 * Regression for https://github.com/rethinkhealth/glion/issues/865.
 *
 * Date: 2026-10-06
 * Symptom: a path naming a standard segment group, such as
 * `PATIENT_RESULT-ORDER_OBSERVATION[2]-OBX-5`, threw "Invalid HL7 path
 * format".
 * Cause: the path grammar read a name as `[A-Z][A-Z0-9]*`, without `_`. 209 of
 * the 267 group names in the bundled HL7 v2 event schemas contain one.
 * Resolution: a name may contain `_` after its first character.
 */

import { f, g, m, s } from "@glion/builder";
import { describe, expect, it } from "vitest";

import { parse, select, selectAll, value } from "../../src";

const ORU = m(
  s("MSH"),
  g(
    "PATIENT_RESULT",
    g("PATIENT", s("PID")),
    g(
      "ORDER_OBSERVATION",
      s("OBR"),
      g("OBSERVATION", s("OBX", f("1"), f("NM")))
    ),
    g(
      "ORDER_OBSERVATION",
      s("OBR"),
      g("OBSERVATION", s("OBX", f("1"), f("ST"))),
      g("OBSERVATION", s("OBX", f("2"), f("TX")))
    )
  )
);

describe("a group name with an underscore", () => {
  it("parses as a group prefix", () => {
    expect(parse("PATIENT_RESULT-ORDER_OBSERVATION[2]-OBX-2")).toStrictEqual({
      field: 2,
      groups: [
        { name: "PATIENT_RESULT" },
        { name: "ORDER_OBSERVATION", repetition: 2 },
      ],
      segment: { name: "OBX" },
    });
  });

  it("parses as the final name", () => {
    expect(parse("ORDER_OBSERVATION[2]")).toStrictEqual({
      segment: { name: "ORDER_OBSERVATION", repetition: 2 },
    });
  });

  it("selects every occurrence of the group", () => {
    expect(selectAll(ORU, "PATIENT_RESULT-ORDER_OBSERVATION")).toHaveLength(2);
  });

  it("selects a segment inside a given occurrence of the group", () => {
    expect(
      value(ORU, "PATIENT_RESULT-ORDER_OBSERVATION[2]-OBX[2]-2")?.value
    ).toBe("TX");
  });

  it("selects the group itself", () => {
    expect(select(ORU, "ORDER_OBSERVATION[2]")?.node).toMatchObject({
      name: "ORDER_OBSERVATION",
      type: "group",
    });
  });
});
