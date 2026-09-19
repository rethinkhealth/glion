import type {
  Component,
  Field,
  FieldRepetition,
  Nodes,
  Subcomponent,
} from "@glion/ast";
import { c, f, m, r, s } from "@glion/builder";
import { unified } from "unified";

import { hl7v2ToHl7v2, toHl7v2 } from "../src";

describe(toHl7v2, () => {
  it("converts a simple MSH segment back to HL7v2 format", () => {
    const msh = s("MSH", f("|"), f("^~\\&"), f("SENDER"));
    const tree = m(msh);

    const result = toHl7v2(tree);
    expect(result).toBe("MSH|^~\\&|SENDER");
  });

  it("handles multiple segments with segment delimiter", () => {
    const tree = m(
      s("MSH", f("|"), f("^~\\&"), f(""), f("2.5")),
      s("PID", f("12345"))
    );

    const result = toHl7v2(tree);
    expect(result).toBe("MSH|^~\\&||2.5\rPID|12345");
  });

  it("handles complex field structures with components and subcomponents", () => {
    const tree = m(
      s(
        "PID",
        // PID.1: component1^component2
        f("component1", "component2"),
        // PID.2: subcomp1&subcomp2
        f(c("subcomp1", "subcomp2"))
      )
    );

    const result = toHl7v2(tree);
    expect(result).toBe("PID|component1^component2|subcomp1&subcomp2");
  });

  it("handles field repetitions", () => {
    const tree = m(
      s(
        "PID",
        // PID.1: rep1~rep2
        f(r("rep1"), r("rep2"))
      )
    );

    const result = toHl7v2(tree);
    expect(result).toBe("PID|rep1~rep2");
  });

  it("handles complex nested structures with all delimiter types", () => {
    const tree = m(
      s(
        "PID",
        // PID.1: A^B&C~D^E
        f(r(c("A"), c("B", "C")), r(c("D"), c("E")))
      )
    );

    const result = toHl7v2(tree);
    expect(result).toBe("PID|A^B&C~D^E");
  });

  it("handles empty values correctly", () => {
    const tree = m(s("PID", f("TEST"), f(""), f("VALUE"), f("")));

    const result = toHl7v2(tree);
    expect(result).toBe("PID|TEST||VALUE|");
  });

  it("handles empty components and subcomponents", () => {
    const tree = m(
      s(
        "PID",
        // Empty component
        f(),
        // Component with empty subcomponents
        f(c("", "value", ""))
      )
    );

    const result = toHl7v2(tree);
    expect(result).toBe("PID||&value&");
  });

  it("handles empty subcomponents", () => {
    const tree = m(
      s(
        "PID",
        // Empty component
        f(),
        // Component with empty subcomponents
        f(c("", "", ""))
      )
    );

    const result = toHl7v2(tree);
    expect(result).toBe("PID||&&");
  });

  it("handles empty components", () => {
    const tree = m(
      s(
        "PID",
        // Empty component
        f(),
        // Component with empty subcomponents
        f(c(), c(), c())
      )
    );

    const result = toHl7v2(tree);
    expect(result).toBe("PID||^^");
  });

  it("uses custom delimiters derived from MSH-1 and MSH-2", () => {
    const tree = m(
      s("MSH", f("*"), f("#$!@"), f("test")),
      s("PID", f(c("A", "B")))
    );

    const result = toHl7v2(tree);
    expect(result).toBe("MSH*#$!@*test\rPID*A@B");
  });

  it("uses default delimiters when none provided in root data", () => {
    const tree = m(s("MSH", f("|"), f("test")));

    const result = toHl7v2(tree);
    expect(result).toBe("MSH|test");
  });

  it("handles real-world MSH segment structure", () => {
    const tree = m(
      s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f("SendingApp"),
        f("SendingFacility"),
        f("ReceivingApp"),
        f("ReceivingFacility"),
        f("20241201120000"),
        f(""),
        f("ADT", "A01"),
        f("MSG00001"),
        f("P"),
        f("2.5")
      )
    );

    const result = toHl7v2(tree);
    expect(result).toBe(
      "MSH|^~\\&|SendingApp|SendingFacility|ReceivingApp|ReceivingFacility|20241201120000||ADT^A01|MSG00001|P|2.5"
    );
  });
});

describe("toHl7v2 with individual node types", () => {
  it("serializes a segment the parser could not name as its fields alone", () => {
    expect(toHl7v2(s("", f("A"), f("B")))).toBe("A|B");
  });

  it("serializes an MSH holding only its field separator as MSH and the separator", () => {
    expect(toHl7v2(s("MSH", f("|")))).toBe("MSH|");
  });

  it("serializes a subcomponent without a value as empty", () => {
    expect(toHl7v2({ type: "subcomponent" } as Subcomponent)).toBe("");
  });

  it("converts individual segments", () => {
    const segmentNode = s("PID", f("12345"), f("DOE", "JOHN"));

    const result = toHl7v2(segmentNode);
    expect(result).toBe("PID|12345|DOE^JOHN");
  });

  it("converts individual fields", () => {
    const fieldNode = f("DOE", "JOHN");

    const result = toHl7v2(fieldNode);
    expect(result).toBe("DOE^JOHN");
  });

  it("converts field repetitions", () => {
    const repNode = r(c("A"), c("B", "C"));

    const result = toHl7v2(repNode);
    expect(result).toBe("A^B&C");
  });

  it("converts components", () => {
    const compNode = c("SUB1", "SUB2");

    const result = toHl7v2(compNode);
    expect(result).toBe("SUB1&SUB2");
  });

  it("converts subcomponents", () => {
    const subNode: Subcomponent = { type: "subcomponent", value: "VALUE" };

    const result = toHl7v2(subNode);
    expect(result).toBe("VALUE");
  });

  it("handles field with repetitions", () => {
    const fieldNode = f(r("rep1"), r("rep2"));

    const result = toHl7v2(fieldNode);
    expect(result).toBe("rep1~rep2");
  });

  it("uses provided delimiters for non-root nodes", () => {
    const customDelimiters = {
      component: "#",
      escape: "!",
      field: "*",
      repetition: "$",
      segment: "\n",
      subcomponent: "@",
    };

    const fieldNode = f(c("A", "B"));

    const result = toHl7v2(fieldNode, customDelimiters);
    expect(result).toBe("A@B");
  });

  it("throws error for unsupported node types", () => {
    const invalidNode = { type: "unknown" } as unknown as Nodes;

    expect(() => toHl7v2(invalidNode)).toThrow(
      "Unsupported node type: unknown"
    );
  });
});

describe("hl7v2ToHl7v2 plugin", () => {
  it("compiles tree to HL7v2 string using unified", () => {
    const tree = m(s("MSH", f("|"), f("test")));

    const processor = unified().use(hl7v2ToHl7v2);

    const result = processor.stringify(tree) as string;
    expect(result).toBe("MSH|test");
  });

  it("works with complex message through unified", () => {
    const tree = m(
      s("MSH", f("|"), f("^~\\&"), f("SendingApp")),
      s("PID", f("12345"), f("DOE", "JOHN"))
    );

    const processor = unified().use(hl7v2ToHl7v2);

    const result = processor.stringify(tree);
    expect(result).toBe("MSH|^~\\&|SendingApp\rPID|12345|DOE^JOHN");
  });

  it("derives custom delimiters from MSH in unified processing", () => {
    const tree = m(
      s("MSH", f("*"), f("#$!@"), f("custom")),
      s("PID", f(c("A", "B")))
    );

    const processor = unified().use(hl7v2ToHl7v2);

    const result = processor.stringify(tree);
    expect(result).toBe("MSH*#$!@*custom\rPID*A@B");
  });
});

describe("trailingDelimiter option", () => {
  it("appends a trailing pipe to a simple non-MSH segment", () => {
    const tree = m(s("PID", f("12345"), f("DOE", "JOHN")));

    const result = toHl7v2(tree, undefined, { trailingDelimiter: true });
    expect(result).toBe("PID|12345|DOE^JOHN|");
  });

  it("appends a trailing pipe to an MSH segment", () => {
    const tree = m(s("MSH", f("|"), f("^~\\&"), f("SENDER")));

    const result = toHl7v2(tree, undefined, { trailingDelimiter: true });
    expect(result).toBe("MSH|^~\\&|SENDER|");
  });

  it("does NOT produce a trailing pipe for a segment with zero fields", () => {
    const seg1 = s("PID");
    seg1.children = [];
    const tree = m(seg1);

    const result = toHl7v2(tree, undefined, { trailingDelimiter: true });
    expect(result).toBe("PID");
  });

  it("appends trailing pipes to each segment in a root with multiple segments", () => {
    const tree = m(
      s("MSH", f("|"), f("^~\\&"), f("APP")),
      s("PID", f("1"), f("DOE"))
    );

    const result = toHl7v2(tree, undefined, { trailingDelimiter: true });
    expect(result).toBe("MSH|^~\\&|APP|\rPID|1|DOE|");
  });

  it("produces no trailing pipe when trailingDelimiter is false", () => {
    const tree = m(s("PID", f("12345"), f("DOE", "JOHN")));

    const result = toHl7v2(tree, undefined, { trailingDelimiter: false });
    expect(result).toBe("PID|12345|DOE^JOHN");
  });

  it("produces no trailing pipe when trailingDelimiter is undefined", () => {
    const tree = m(s("PID", f("12345"), f("DOE", "JOHN")));

    const result = toHl7v2(tree);
    expect(result).toBe("PID|12345|DOE^JOHN");
  });
});

describe("getSegmentName graceful degradation", () => {
  it("handles segment with no fields by returning empty segment name", () => {
    // Simulate a malformed segment with no children (fields)
    const malformedSegment = s("");

    const result = toHl7v2(malformedSegment);
    // Should produce empty string as segment name (no segment identifier)
    expect(result).toBe("");
  });

  it("handles first field with no field repetitions by returning empty segment name", () => {
    // Simulate a field without field repetitions
    const malformedSegment = s("", f(""));
    const field = malformedSegment.children[0];
    if (field) {
      field.children = [];
    }

    const result = toHl7v2(malformedSegment);
    // Should produce empty string as segment name
    expect(result).toBe("");
  });

  it("handles first field repetition with no components by returning empty segment name", () => {
    // Simulate a field repetition without components
    const malformedSegment = s("", f(r("")));
    const rep = malformedSegment.children[0]?.children[0];
    if (rep) {
      rep.children = [];
    }

    const result = toHl7v2(malformedSegment);
    // Should produce empty string as segment name
    expect(result).toBe("");
  });

  it("handles first component with no subcomponents by returning empty segment name", () => {
    // Simulate a component without subcomponents
    const malformedSegment = s("", f(r(c(""))));
    const component = malformedSegment.children[0]?.children[0]?.children[0];
    if (component) {
      component.children = [];
    }

    const result = toHl7v2(malformedSegment);
    // Should produce empty string as segment name
    expect(result).toBe("");
  });

  it("handles empty segment name by returning empty string", () => {
    // Simulate a segment where the first subcomponent has no value
    const malformedSegment = s("", f(c("")));

    const result = toHl7v2(malformedSegment);
    // Should produce empty string as segment name
    expect(result).toBe("");
  });

  describe("real-world malformed HL7v2 scenarios", () => {
    it("handles corrupted message starting with field delimiter gracefully", () => {
      // This would result from parsing "|SOME_APP|FACILITY|"
      // where the segment name is missing
      const corruptedSegment = s("PID", f(c("")), f("SOME_APP"));

      const result = toHl7v2(corruptedSegment);
      // Should produce "|SOME_APP" - empty segment name but rest of data preserved
      expect(result).toBe("PID||SOME_APP");
    });

    it("handles truncated segment parsing gracefully", () => {
      // This could result from parsing a truncated message like "MSH"
      // where the parser stopped before creating the full hierarchy
      const truncatedSegment = s("PID", f(""));
      const field = truncatedSegment.children[0];
      if (field) {
        field.children = [];
      }

      const result = toHl7v2(truncatedSegment);
      // Should produce empty string - no segment name, no additional fields
      expect(result).toBe("PID");
    });

    it("handles empty message parsing gracefully", () => {
      // This could result from parsing an empty line or just delimiters
      const emptySegment = m(s(""), s(""));

      const result = toHl7v2(emptySegment);
      // Should produce empty string - no content at all
      expect(result).toBe("\r");
    });
  });

  describe("manual AST construction issues", () => {
    it("handles missing field-repetition layer gracefully", () => {
      // Developer error: trying to put components directly in fields
      // This violates the AST hierarchy: field -> field-repetition -> component -> subcomponent
      const badManualSegment = s("", f("MSH"));
      const field = badManualSegment.children[0] as Field;
      field.children = [c("MSH")] as unknown as FieldRepetition[];

      const result = toHl7v2(badManualSegment);
      // Should gracefully handle the malformed structure and return empty string
      expect(result).toBe("");
    });

    it("handles missing component layer gracefully", () => {
      // Developer error: trying to put subcomponents directly in field-repetitions
      const badManualSegment = s("", f("MSH"));
      const rep = badManualSegment.children[0]?.children[0] as FieldRepetition;
      rep.children = [
        { type: "subcomponent", value: "MSH" },
      ] as unknown as Component[];

      const result = toHl7v2(badManualSegment);
      // Should gracefully handle the malformed structure and return empty string
      expect(result).toBe("");
    });
  });

  // oxlint-disable-next-line jest/prefer-lowercase-title
  describe("AST transformation scenarios", () => {
    it("documents what happens when transformations accidentally remove required nodes", () => {
      // This simulates what might happen if a transformation accidentally
      // removes the first field containing the segment identifier
      const transformedSegment = s(
        "PID",
        // First field (segment name) was accidentally removed by transformation
        f("SOME_DATA")
      );

      // While this has a valid structure, the segment name is wrong
      const result = toHl7v2(transformedSegment);
      // This would produce "SOME_DATA" instead of a proper segment name like "PID"
      expect(result).toBe("PID|SOME_DATA");
    });

    it("shows the importance of preserving the first field", () => {
      // Correct structure - first field contains segment name
      const correctSegment = s("PID", f("SOME_DATA"));

      const result = toHl7v2(correctSegment);
      expect(result).toBe("PID|SOME_DATA");
    });
  });
});
