import type { Group, Root, Segment } from "@glion/ast";
import { c, f, g, m, r, s } from "@glion/builder";

import { select, selectAll } from "../src/select";

const makeSample = (): Root =>
  m(
    s("MSH", f("|"), f("MyApp")),
    s(
      "PID",
      f("1"),
      f(""),
      f(""),
      f(c("Smith"), c("John"), c("Sarah")),
      f(r(c("123456"), c("DOE"), c("JOHN")), r(c("A"), c("III"), c("L")))
    )
  );

describe(select, () => {
  const root = makeSample();

  it("locates segments", () => {
    const result = select(root, "PID");
    expect(result?.node.type).toBe("segment");
    expect(result?.ancestors).toHaveLength(1);
    expect(result?.ancestors[0]?.type).toBe("root");
    expect((result?.node as Segment).name).toBe("PID");
  });

  it("locates fields", () => {
    const result = select(root, "PID-4");
    expect(result?.node.type).toBe("field");
    expect(result?.ancestors).toHaveLength(2);
    expect(result?.ancestors[0]?.type).toBe("root");
    expect(result?.ancestors[1]?.type).toBe("segment");
    expect(result?.node.children[0].children[0].children[0].value).toBe(
      "Smith"
    );
  });

  it("locates repetitions with implicit default", () => {
    const result = select(root, "PID-4[1]");
    expect(result?.node.type).toBe("field-repetition");
    expect(result?.ancestors).toHaveLength(3);
    expect(result?.ancestors[0]?.type).toBe("root");
    expect(result?.ancestors[1]?.type).toBe("segment");
    expect(result?.ancestors[2]?.type).toBe("field");
    expect(result?.node.children[0].children[0].value).toBe("Smith");
  });

  it("locates repetitions explicitly", () => {
    const result = select(root, "PID-5[2]");
    expect(result?.node.type).toBe("field-repetition");
    expect(result?.ancestors).toHaveLength(3);
    expect(result?.node.children[0].children[0].value).toBe("A");
  });

  it("locates components", () => {
    const result = select(root, "PID-4[1].3");
    expect(result?.node.type).toBe("component");
    expect(result?.ancestors).toHaveLength(4);
    expect(result?.ancestors[3]?.type).toBe("field-repetition");
    expect(result?.node.children[0].value).toBe("Sarah");
  });

  it("locates components without explicit repetition", () => {
    const result = select(root, "PID-4.2");
    expect(result?.node.type).toBe("component");
    expect(result?.ancestors).toHaveLength(4);
    expect(result?.node.children[0].value).toBe("John");
  });

  it("locates subcomponents", () => {
    const result = select(root, "PID-4[1].1.1");
    expect(result?.node.type).toBe("subcomponent");
    expect(result?.ancestors).toHaveLength(5);
    expect(result?.ancestors[4]?.type).toBe("component");
    expect(result?.node.value).toBe("Smith");
  });

  it("locates subcomponents with implicit repetition", () => {
    const result = select(root, "PID-4.1.1");
    expect(result?.node.type).toBe("subcomponent");
    expect(result?.ancestors).toHaveLength(5);
    expect(result?.ancestors[4]?.type).toBe("component");
    expect(result?.node.value).toBe("Smith");
  });

  it("returns null when path is missing", () => {
    expect(select(root, "OBX")).toBeNull();
    expect(select(root, "PID-9")).toBeNull();
  });

  it("returns null when field is out of bounds", () => {
    expect(select(root, "PID-99")).toBeNull();
  });

  it("returns null when repetition is out of bounds", () => {
    expect(select(root, "PID-5[99]")).toBeNull();
  });

  it("returns null when component is out of bounds", () => {
    expect(select(root, "PID-4.99")).toBeNull();
  });

  it("returns null when subcomponent is out of bounds", () => {
    expect(select(root, "PID-4.1.99")).toBeNull();
  });

  it("can retrieve field repetition directly", () => {
    const result = select(root, "PID-5[1]");
    expect(result?.node.type).toBe("field-repetition");
    expect(result?.ancestors).toHaveLength(3);
    expect(result?.node.children[0].children[0].value).toBe("123456");
  });

  it("returns null when trying to get non-existent subcomponent", () => {
    const message = m(s("PID", f(r(c("Simple")))));
    expect(select(message, "PID-1.1.2")).toBeNull();
  });

  it("handles component access with nested structure", () => {
    const message = m(s("PID", f(r(c("SubValue")))));
    const result = select(message, "PID-1.1");
    expect(result?.node.type).toBe("component");
    expect(result?.ancestors).toHaveLength(4);
    expect(result?.node.children[0].value).toBe("SubValue");
  });

  describe("with segment repetitions", () => {
    const message = m(
      s("MSH", f("|")),
      s("PID", f("First")),
      s("PID", f("Second")),
      s("PID", f("Third"))
    );

    it("finds first segment by default", () => {
      const result = select(message, "PID");
      expect(result?.node.type).toBe("segment");
      expect(result?.ancestors).toHaveLength(1);
    });

    it("returns null for non-existent repetition", () => {
      expect(select(message, "PID[4]")).toBeNull();
    });
  });

  describe("with groups", () => {
    const message = m(
      s("MSH", f("|")),
      g(
        "ORDER",
        s("ORC", f("OrderControl")),
        s("OBR", f("ObservationRequest"))
      ),
      g("PATIENT", s("PID", f("PatientID")), s("PV1", f("PatientVisit")))
    );

    it("finds segments within groups", () => {
      const result = select(message, "ORDER-ORC");
      expect(result?.node.type).toBe("segment");
      expect(result?.ancestors).toHaveLength(2);
      expect(result?.ancestors[0]?.type).toBe("root");
      expect(result?.ancestors[1]?.type).toBe("group");
      expect((result?.node as Segment).name).toBe("ORC");
      expect((result?.ancestors[1] as Group).name).toBe("ORDER");
    });

    it("returns null for non-existent group", () => {
      expect(select(message, "RESULT-OBX")).toBeNull();
    });
  });

  describe("with nested groups", () => {
    const message = m(
      s("MSH", f("|")),
      g(
        "ORDERS",
        s("ORC", f("OrderControl")),
        g("RESULT", s("OBX", f("Result1"))),
        g("RESULT", s("OBX", f("Result2")))
      )
    );

    it("returns null for non-existent nested group", () => {
      expect(select(message, "ORDERS-RESULT[3]-OBX")).toBeNull();
    });

    it("includes implicit group ancestors for nested segments without explicit navigation", () => {
      const result = select(message, "OBX");
      expect(result?.node.type).toBe("segment");
      expect(result?.ancestors.map((node) => node.type)).toStrictEqual([
        "root",
        "group",
        "group",
      ]);
      expect((result?.ancestors[1] as Group).name).toBe("ORDERS");
      expect((result?.ancestors[2] as Group).name).toBe("RESULT");
    });
  });

  describe("with bare-name resolution of nested groups", () => {
    // Fixture from the bug report: root > INSURANCE > ORDER > ORC
    const message = m(
      s("MSH", f("|")),
      g("INSURANCE", g("ORDER", s("ORC", f("x"))))
    );

    it("finds a nested group by bare name at any depth", () => {
      const result = select(message, "ORDER");
      expect(result).not.toBeNull();
      expect(result?.node.type).toBe("group");
      expect((result?.node as Group).name).toBe("ORDER");
    });

    it("threads ancestors so the last ancestor is the direct parent", () => {
      const result = select(message, "ORDER");
      expect(result?.ancestors.map((node) => node.type)).toStrictEqual([
        "root",
        "group",
      ]);
      expect((result?.ancestors[1] as Group).name).toBe("INSURANCE");
    });

    it("resolves segments and nested groups consistently at the same depth", () => {
      const groupResult = select(message, "ORDER");
      const segmentResult = select(message, "ORC");
      expect(groupResult).not.toBeNull();
      expect(segmentResult).not.toBeNull();
      // Both resolve at depth; the group's direct parent is INSURANCE,
      // the segment's direct parent is the ORDER group.
      expect((groupResult!.ancestors.at(-1) as Group).name).toBe("INSURANCE");
      expect((segmentResult!.ancestors.at(-1) as Group).name).toBe("ORDER");
    });

    it("returns null for a non-existent group", () => {
      expect(select(message, "RESULT")).toBeNull();
    });
  });

  describe("with empty fields", () => {
    const message = m(s("PID", f(""), f("Value"), f("")));

    it("finds empty fields", () => {
      const result = select(message, "PID-1");
      expect(result?.node.type).toBe("field");
      expect(result?.ancestors).toHaveLength(2);
    });
  });

  describe("existence checks", () => {
    it("confirms existing paths", () => {
      expect(select(root, "PID-4")).not.toBeNull();
      expect(select(root, "PID-4[1].1.1")).not.toBeNull();
    });

    it("returns null for missing paths", () => {
      expect(select(root, "OBX")).toBeNull();
      expect(select(root, "PID-4[3]")).toBeNull();
    });

    it("finds existing segments", () => {
      expect(select(root, "MSH")).not.toBeNull();
      expect(select(root, "PID")).not.toBeNull();
    });

    it("returns null for missing segments", () => {
      expect(select(root, "OBX")).toBeNull();
    });

    it("finds existing fields", () => {
      expect(select(root, "PID-1")).not.toBeNull();
    });

    it("returns null for missing fields", () => {
      expect(select(root, "PID-99")).toBeNull();
    });

    it("works with groups", () => {
      const message = m(
        s("MSH", f("|")),
        g("ORDER", s("ORC", f("OrderControl")))
      );

      expect(select(message, "ORDER-ORC")).not.toBeNull();
      expect(select(message, "ORDER-ORC-1")).not.toBeNull();
      expect(select(message, "ORDER-OBR")).toBeNull();
    });
  });
});

describe(selectAll, () => {
  it("returns all matching segments", () => {
    const message = m(
      s("MSH", f("|")),
      s("PID", f("First")),
      s("PID", f("Second")),
      s("PID", f("Third"))
    );

    const results = selectAll(message, "PID");
    expect(results).toHaveLength(3);
    expect(
      results.every((result) => result.node.type === "segment")
    ).toBeTruthy();
  });

  it("returns group nodes when path targets a group", () => {
    const message = m(
      s("MSH", f("|")),
      g("ORDER", s("OBX", f("Observation1"))),
      g("ORDER", s("OBX", f("Observation2")))
    );

    const results = selectAll(message, "ORDER");
    expect(results).toHaveLength(2);
    expect(
      results.every((result) => result.node.type === "group")
    ).toBeTruthy();
  });

  it("includes implicit group ancestors for nested segments", () => {
    const message = m(
      s("MSH", f("|")),
      g("ORDER", g("RESULT", s("OBX", f("Nested"))))
    );

    const results = selectAll(message, "OBX");
    expect(results).toHaveLength(1);
    const nested = results[0];
    expect(nested?.ancestors.map((node) => node.type)).toStrictEqual([
      "root",
      "group",
      "group",
    ]);
    expect((nested?.ancestors[1] as Group).name).toBe("ORDER");
    expect((nested?.ancestors[2] as Group).name).toBe("RESULT");
  });

  it("includes implicit group ancestors for nested groups", () => {
    const message = m(
      s("MSH", f("|")),
      g("INSURANCE", g("ORDER", s("ORC", f("x"))))
    );

    const results = selectAll(message, "ORDER");
    expect(results).toHaveLength(1);
    const nested = results[0];
    expect(nested?.node.type).toBe("group");
    expect((nested?.node as Group).name).toBe("ORDER");
    expect(nested?.ancestors.map((node) => node.type)).toStrictEqual([
      "root",
      "group",
    ]);
    expect((nested?.ancestors[1] as Group).name).toBe("INSURANCE");
  });

  it("finds nested groups at every depth via bare name", () => {
    const message = m(
      s("MSH", f("|")),
      g("A", g("B", g("C", s("ORC", f("x")))))
    );

    const results = selectAll(message, "C");
    expect(results).toHaveLength(1);
    expect((results[0]?.node as Group).name).toBe("C");
    expect((results[0]?.ancestors.at(-1) as Group).name).toBe("B");
  });

  it("returns empty array when no matches", () => {
    const message = m(s("MSH", f("|")));
    const results = selectAll(message, "PID");
    expect(results).toHaveLength(0);
  });

  it("returns all matching fields from multiple segments", () => {
    const message = m(
      s("MSH", f("|")),
      s("OBX", f("Result1")),
      s("OBX", f("Result2")),
      s("OBX", f("Result3"))
    );

    const results = selectAll(message, "OBX-1");
    expect(results).toHaveLength(3);
    expect(
      results.every((result) => result.node.type === "field")
    ).toBeTruthy();
  });

  it("works with groups", () => {
    const message = m(
      s("MSH", f("|")),
      g("ORDER", s("OBX", f("Observation1"))),
      g("ORDER", s("OBX", f("Observation2")))
    );

    const results = selectAll(message, "ORDER-OBX");
    expect(results).toHaveLength(2);
  });

  it("returns single result when repetition is specified", () => {
    const message = m(
      s("MSH", f("|")),
      s("PID", f("First")),
      s("PID", f("Second"))
    );

    const results = selectAll(message, "PID[2]");
    expect(results).toHaveLength(1);
  });
});
