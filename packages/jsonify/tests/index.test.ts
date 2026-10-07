import { f, g, m, s } from "@glion/builder";
import { unified } from "unified";

import { hl7v2Jsonify } from "../src/processor";

describe("hl7v2Jsonify plugin", () => {
  it("compiles single segment tree to JSON", async () => {
    const tree = m(
      s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f("SENDER"),
        f("FAC"),
        f("RCVR"),
        f("FAC"),
        f("20250101010101"),
        f(""),
        f(["ADT", "A01"]),
        f("MSG00001"),
        f("P"),
        f("2.5")
      )
    );
    const result = await unified().use(hl7v2Jsonify).stringify(tree);

    expect(result).toStrictEqual([
      {
        fields: [
          "|",
          "^~\\&",
          "SENDER",
          "FAC",
          "RCVR",
          "FAC",
          "20250101010101",
          "",
          ["ADT", "A01"],
          "MSG00001",
          "P",
          "2.5",
        ],
        segment: "MSH",
      },
    ]);
  });

  it("compiles multiple segment tree to JSON", async () => {
    // Given
    const tree = m(
      s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f("SENDER"),
        f("FAC"),
        f("RCVR"),
        f("FAC"),
        f("20250101010101"),
        f(""),
        f(["ADT", "A01"]),
        f("MSG00001"),
        f("P"),
        f("2.5")
      ),
      s("PID", f("1234567890"))
    );

    // WHEN
    const result = await unified().use(hl7v2Jsonify).stringify(tree);

    // THEN
    expect(result).toStrictEqual([
      {
        fields: [
          "|",
          "^~\\&",
          "SENDER",
          "FAC",
          "RCVR",
          "FAC",
          "20250101010101",
          "",
          ["ADT", "A01"],
          "MSG00001",
          "P",
          "2.5",
        ],
        segment: "MSH",
      },
      { fields: ["1234567890"], segment: "PID" },
    ]);
  });

  it("compiles tree with groups to JSON", async () => {
    const tree = m(s("MSH", f("|")), g("PATIENT", s("PID", f("1234567890"))));

    const result = await unified().use(hl7v2Jsonify).stringify(tree);
    expect(result).toStrictEqual([
      { fields: ["|"], segment: "MSH" },
      {
        children: [{ fields: ["1234567890"], segment: "PID" }],
        group: "PATIENT",
        name: "PATIENT",
      },
    ]);
  });
});
