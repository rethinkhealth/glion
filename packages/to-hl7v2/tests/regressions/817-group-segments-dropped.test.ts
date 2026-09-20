/**
 * Regression for https://github.com/rethinkhealth/glion/issues/817.
 *
 * Date: 2026-09-19
 * Symptom: serializing a tree that holds segment groups dropped every segment
 * inside a group and wrote the group's name as if it were a segment:
 * `MSH|^~\&\rPATIENT` for a `PATIENT` group holding a `PID`.
 * Cause: the root's children were cast to segments and serialized as such,
 * and the dispatch had no `group` arm; its exhaustiveness check was disabled
 * with `@ts-expect-error`.
 * Resolution: groups serialize as their segments, at the root and on their
 * own, and the exhaustiveness check is a real `never` assignment.
 */

import { f, g, m, s } from "@glion/builder";
import { describe, expect, it } from "vitest";

import { toHl7v2 } from "../../src";

describe("toHl7v2 with segment groups", () => {
  const msh = () => s("MSH", f("|"), f("^~\\&"), f("SENDER"));
  const pid = () => s("PID", f("1"), f(""), f("12345"));
  const orc = () => s("ORC", f("RE"));
  const obr = () => s("OBR", f("1"));
  const obx = (n: string) => s("OBX", f(n), f("NM"));

  it("serializes nested groups to the same text as the flat segments", () => {
    const flat = m(msh(), pid(), orc(), obr(), obx("1"), obx("2"));
    const grouped = m(
      msh(),
      g(
        "PATIENT_RESULT",
        g("PATIENT", pid()),
        g(
          "ORDER_OBSERVATION",
          orc(),
          obr(),
          g("OBSERVATION", obx("1")),
          g("OBSERVATION", obx("2"))
        )
      )
    );

    expect(toHl7v2(grouped)).toBe(toHl7v2(flat));
  });

  it("serializes a group on its own as its segments", () => {
    expect(toHl7v2(g("OBSERVATION", obx("1"), obx("2")))).toBe(
      "OBX|1|NM\rOBX|2|NM"
    );
  });
});
