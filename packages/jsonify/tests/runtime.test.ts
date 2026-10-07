import { c, f, g, m, r, s } from "@glion/builder";

import { toJsonRuntime } from "../src/runtime";

describe(toJsonRuntime, () => {
  it("converts a simple MSH segment (parser-shaped AST)", () => {
    const tree = m(s("MSH", f("^~\\&"), f("SENDER")));
    const result = toJsonRuntime(tree);
    expect(result).toStrictEqual([
      { fields: ["^~\\&", "SENDER"], segment: "MSH" },
    ]);
  });

  it("handles nested components, subcomponents, and repetitions", () => {
    const tree = m(
      s(
        "PID",
        // PID header field
        f("123", "456"),
        f(r("A", "123"), "B"),
        f(c("X", "Y"))
      )
    );

    const result = toJsonRuntime(tree);
    expect(result).toStrictEqual([
      {
        fields: [["123", "456"], [["A", "123"], "B"], [["X", "Y"]]],
        segment: "PID",
      },
    ]);
  });

  it("handles multiple segments", () => {
    const tree = m(s("MSH", f("|")), s("PID", f("12345")));
    const result = toJsonRuntime(tree);
    expect(result).toStrictEqual([
      { fields: ["|"], segment: "MSH" },
      { fields: ["12345"], segment: "PID" },
    ]);
  });

  it("handles multiple segments with groups", () => {
    const tree = m(s("MSH", f("|")), g("PATIENT", s("PID", f("12345"))));
    const result = toJsonRuntime(tree);
    expect(result).toStrictEqual([
      { fields: ["|"], segment: "MSH" },
      {
        children: [{ fields: ["12345"], segment: "PID" }],
        group: "PATIENT",
        name: "PATIENT",
      },
    ]);
  });

  it("handles multiple segments with nested groups", () => {
    const tree = m(
      s("MSH", f("|")),
      g("PATIENT", s("PID", f("hello")), g("ORDER", s("OBX", f("world"))))
    );
    const result = toJsonRuntime(tree);
    expect(result).toStrictEqual([
      { fields: ["|"], segment: "MSH" },
      {
        children: [
          { fields: ["hello"], segment: "PID" },
          {
            children: [{ fields: ["world"], segment: "OBX" }],
            group: "ORDER",
            name: "ORDER",
          },
        ],
        group: "PATIENT",
        name: "PATIENT",
      },
    ]);
  });

  it("emits a group's ID and its name", () => {
    const tree = m(
      s("MSH", f("|")),
      g({ id: "PATIENT_VISIT", name: "Patient Visit" }, s("PV1", f("1")))
    );
    expect(toJsonRuntime(tree)).toStrictEqual([
      { fields: ["|"], segment: "MSH" },
      {
        children: [{ fields: ["1"], segment: "PV1" }],
        group: "PATIENT_VISIT",
        name: "Patient Visit",
      },
    ]);
  });

  it("creates empty string when header is missing", () => {
    const tree = m(s(""));
    const result = toJsonRuntime(tree);
    expect(result).toStrictEqual([{ fields: [], segment: "" }]);
  });

  it("materializes [ [] ] as an empty string", () => {
    const tree = m(
      s(
        "PID",
        // PID.1 -> [[]] (one component, zero subcomponents)
        f()
      )
    );
    const result = toJsonRuntime(tree);
    expect(result).toStrictEqual([
      {
        fields: [""],
        segment: "PID",
      },
    ]);
  });

  it('materializes [ [], [], [] ] as ["", "", ""]', () => {
    const tree = m(s("PID", f("", "", "")));
    const result = toJsonRuntime(tree);
    expect(result).toStrictEqual([
      {
        fields: [["", "", ""]],
        segment: "PID",
      },
    ]);
  });

  it('materializes [ [ [] ], [ [] ] ] as ["", ""]', () => {
    const tree = m(s("PID", f(r(), r())));
    const result = toJsonRuntime(tree);
    expect(result).toStrictEqual([
      {
        fields: [["", ""]],
        segment: "PID",
      },
    ]);
  });
});
