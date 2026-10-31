import type {
  Component,
  Field,
  FieldRepetition,
  Nodes,
  Segment,
  Subcomponent,
} from "@glion/ast";
import { c, f, g, m, r, s } from "@glion/builder";
import { unified } from "unified";

import {
  EscapeSequenceError,
  hl7v2ToHl7v2,
  SegmentTerminatorError,
  toHl7v2,
} from "../src";

describe(toHl7v2, () => {
  it("converts a simple MSH segment back to HL7v2 format", () => {
    const msh = s("MSH", f("|"), f("^~\\&"), f("SENDER"));
    const tree = m(msh);

    const result = toHl7v2(tree);
    expect(result).toBe("MSH|^~\\&|SENDER\r");
  });

  // The parser reads `MSH` followed by a segment terminator as an MSH with no
  // fields; a field separator after it would be read back as MSH-1.
  it("writes an MSH with no fields as its Segment ID alone", () => {
    expect(toHl7v2(m(s("MSH"), s("PID", f("1"))))).toBe("MSH\rPID|1\r");
  });

  it("handles multiple segments with segment delimiter", () => {
    const tree = m(
      s("MSH", f("|"), f("^~\\&"), f(""), f("2.5")),
      s("PID", f("12345"))
    );

    const result = toHl7v2(tree);
    expect(result).toBe("MSH|^~\\&||2.5\rPID|12345\r");
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
    expect(result).toBe("PID|component1^component2|subcomp1&subcomp2\r");
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
    expect(result).toBe("PID|rep1~rep2\r");
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
    expect(result).toBe("PID|A^B&C~D^E\r");
  });

  it("handles empty values correctly", () => {
    const tree = m(s("PID", f("TEST"), f(""), f("VALUE"), f("")));

    const result = toHl7v2(tree);
    expect(result).toBe("PID|TEST||VALUE|\r");
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
    expect(result).toBe("PID||&value&\r");
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
    expect(result).toBe("PID||&&\r");
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
    expect(result).toBe("PID||^^\r");
  });

  it("uses custom delimiters derived from MSH-1 and MSH-2", () => {
    const tree = m(
      s("MSH", f("*"), f("#$!@"), f("test")),
      s("PID", f(c("A", "B")))
    );

    const result = toHl7v2(tree);
    expect(result).toBe("MSH*#$!@*test\rPID*A@B\r");
  });

  it("uses default delimiters when none provided in root data", () => {
    const tree = m(s("MSH", f("|"), f("test")));

    const result = toHl7v2(tree);
    expect(result).toBe("MSH|test\r");
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
      "MSH|^~\\&|SendingApp|SendingFacility|ReceivingApp|ReceivingFacility|20241201120000||ADT^A01|MSG00001|P|2.5\r"
    );
  });
});

describe("toHl7v2 with individual node types", () => {
  it("serializes a segment with an empty Segment ID as the field separator and its fields", () => {
    expect(toHl7v2(s("", f("A"), f("B")))).toBe("|A|B");
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
    expect(result).toBe("MSH|test\r");
  });

  it("works with complex message through unified", () => {
    const tree = m(
      s("MSH", f("|"), f("^~\\&"), f("SendingApp")),
      s("PID", f("12345"), f("DOE", "JOHN"))
    );

    const processor = unified().use(hl7v2ToHl7v2);

    const result = processor.stringify(tree);
    expect(result).toBe("MSH|^~\\&|SendingApp\rPID|12345|DOE^JOHN\r");
  });

  it("derives custom delimiters from MSH in unified processing", () => {
    const tree = m(
      s("MSH", f("*"), f("#$!@"), f("custom")),
      s("PID", f(c("A", "B")))
    );

    const processor = unified().use(hl7v2ToHl7v2);

    const result = processor.stringify(tree);
    expect(result).toBe("MSH*#$!@*custom\rPID*A@B\r");
  });
});

describe("segment terminator", () => {
  it("writes a message with no segments as empty text", () => {
    expect(toHl7v2(m())).toBe("");
  });

  it("writes the segment terminator after a segment with only empty fields", () => {
    expect(toHl7v2(m(s("MSH", f("|"), f("^~\\&")), s("PID", f(), f())))).toBe(
      "MSH|^~\\&\rPID||\r"
    );
  });

  it("writes the segment terminator after the last segment of a group", () => {
    const tree = m(
      s("MSH", f("|"), f("^~\\&")),
      g("PATIENT", s("PID", f("1")), g("VISIT", s("PV1", f("1"))))
    );

    expect(toHl7v2(tree)).toBe("MSH|^~\\&\rPID|1\rPV1|1\r");
  });

  it("writes each segment as it ended in the text it was read from", () => {
    const tree = m(s("MSH", f("|"), f("^~\\&")), s("PID", f("1")), s("PV1"));
    const [msh, pid, pv1] = tree.children as Segment[];
    (msh as Segment).terminator = "\r\n";
    (pid as Segment).terminator = "\n";
    (pv1 as Segment).terminator = "";

    expect(toHl7v2(tree)).toBe("MSH|^~\\&\r\nPID|1\nPV1");
  });

  it("throws a SegmentTerminatorError for a segment with no terminator that another segment follows", () => {
    const tree = m(s("MSH", f("|"), f("^~\\&")), s("PID", f("1")));
    const pid = tree.children[1] as Segment;
    pid.terminator = "";
    tree.children.push(s("ZPI", f("x")));

    expect(() => toHl7v2(tree)).toThrow(
      expect.objectContaining({
        message:
          "A segment that another segment follows has no segment terminator; HL7v2 ends every segment with a carriage return. Set the segment's `terminator`, or apply `@glion/transform-segment-terminator`.",
        name: "SegmentTerminatorError",
        segment: pid,
      })
    );
  });

  it("throws a SegmentTerminatorError for a segment with no terminator that a segment in a later group follows", () => {
    const pid = s("PID", f("1"));
    pid.terminator = "";
    const tree = m(g("PATIENT", pid), g("VISIT", s("PV1", f("1"))));

    expect(() => toHl7v2(tree)).toThrow(SegmentTerminatorError);
  });

  it("throws a TypeError for a segment without a terminator", () => {
    const tree = m(s("MSH", f("|"), f("^~\\&")), s("PID", f("1")));
    Reflect.deleteProperty(tree.children[1] as Segment, "terminator");

    expect(() => toHl7v2(tree)).toThrow(
      new TypeError(
        "The segment has no `terminator`; every segment has one, an empty string when nothing ends the segment."
      )
    );
  });

  it("writes nothing after a last segment with no terminator", () => {
    const tree = m(s("MSH", f("|"), f("^~\\&")), s("PID", f("1")));
    (tree.children[1] as Segment).terminator = "";

    expect(toHl7v2(tree)).toBe("MSH|^~\\&\rPID|1");
  });

  it("writes a segment on its own without a segment terminator", () => {
    expect(toHl7v2(s("PID", f("1")))).toBe("PID|1");
  });
});

describe("trailing empty fields", () => {
  it("writes a field delimiter for each trailing empty field", () => {
    const tree = m(s("PID", f("12345"), f("DOE", "JOHN"), f(), f()));

    expect(toHl7v2(tree)).toBe("PID|12345|DOE^JOHN||\r");
  });

  it("writes a field delimiter for a trailing empty field in MSH", () => {
    const tree = m(s("MSH", f("|"), f("^~\\&"), f("SENDER"), f()));

    expect(toHl7v2(tree)).toBe("MSH|^~\\&|SENDER|\r");
  });

  it("writes a segment with one empty field as its Segment ID and a field delimiter", () => {
    expect(toHl7v2(s("PID", f()))).toBe("PID|");
  });

  it("writes a segment with no fields as its Segment ID alone", () => {
    expect(toHl7v2(s("PID"))).toBe("PID");
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

  it("writes an empty Segment ID and one field with no field repetitions as the field separator", () => {
    // Simulate a field without field repetitions
    const malformedSegment = s("", f(""));
    const field = malformedSegment.children[0];
    if (field) {
      field.children = [];
    }

    const result = toHl7v2(malformedSegment);
    expect(result).toBe("|");
  });

  it("writes an empty Segment ID and one field repetition with no components as the field separator", () => {
    // Simulate a field repetition without components
    const malformedSegment = s("", f(r("")));
    const rep = malformedSegment.children[0]?.children[0];
    if (rep) {
      rep.children = [];
    }

    const result = toHl7v2(malformedSegment);
    expect(result).toBe("|");
  });

  it("writes an empty Segment ID and one component with no subcomponents as the field separator", () => {
    // Simulate a component without subcomponents
    const malformedSegment = s("", f(r(c(""))));
    const component = malformedSegment.children[0]?.children[0]?.children[0];
    if (component) {
      component.children = [];
    }

    const result = toHl7v2(malformedSegment);
    expect(result).toBe("|");
  });

  it("writes an empty Segment ID and one empty field as the field separator", () => {
    const malformedSegment = s("", f(c("")));

    const result = toHl7v2(malformedSegment);
    expect(result).toBe("|");
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
      const truncatedSegment = s("PID", f(""));
      const field = truncatedSegment.children[0];
      if (field) {
        field.children = [];
      }

      expect(toHl7v2(truncatedSegment)).toBe("PID|");
    });

    it("writes each segment with an empty Segment ID and no fields as its terminator", () => {
      expect(toHl7v2(m(s(""), s("")))).toBe("\r\r");
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
      expect(result).toBe("|");
    });

    it("handles missing component layer gracefully", () => {
      // Developer error: trying to put subcomponents directly in field-repetitions
      const badManualSegment = s("", f("MSH"));
      const rep = badManualSegment.children[0]?.children[0] as FieldRepetition;
      rep.children = [
        { type: "subcomponent", value: "MSH" },
      ] as unknown as Component[];

      const result = toHl7v2(badManualSegment);
      expect(result).toBe("|");
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

describe("toHl7v2 escape sequences", () => {
  it("writes delimiters inside a value as escape sequences", () => {
    const tree = m(s("PID", f("a|b^c~d&e")));

    expect(toHl7v2(tree)).toBe("PID|a\\F\\b\\S\\c\\R\\d\\T\\e\r");
  });

  it("writes a character whose escape code is a delimiter as a hexadecimal escape", () => {
    const tree = m(s("MSH", f("^"), f("E\\<$")), s("PID", f("a<b")));

    expect(toHl7v2(tree)).toBe("MSH^E\\<$\rPID^a<X3C<b\r");
  });

  it("throws EscapeSequenceError for a value no escape sequence can write with the delimiters", () => {
    const tree = m(s("MSH", f("X"), f("S~\\&")), s("PID", f("aSb")));

    expect(() => toHl7v2(tree)).toThrow(EscapeSequenceError);
  });

  it("writes the escape character, the segment delimiter, and control characters as escape sequences", () => {
    const tree = m(s("PID", f("a\\b\rc\nd")));

    expect(toHl7v2(tree)).toBe("PID|a\\E\\b\\.br\\c\\X0A\\d\r");
  });

  it("writes a formatting command, a locally defined sequence, and a character set switch as they are", () => {
    const tree = m(
      s("PID", f("\\H\\a|b\\N\\\\Zsite 7\\c\\C2842\\d\\M2442\\e"))
    );

    expect(toHl7v2(tree)).toBe(
      "PID|\\H\\a\\F\\b\\N\\\\Zsite 7\\c\\C2842\\d\\M2442\\e\r"
    );
  });

  it("writes MSH-1 and MSH-2 as they are", () => {
    const tree = m(s("MSH", f("|"), f("^~\\&"), f("a|b")));

    expect(toHl7v2(tree)).toBe("MSH|^~\\&|a\\F\\b\r");
  });

  it("writes escape sequences with the escape character MSH-2 declares", () => {
    const tree = m(s("MSH", f("*"), f("%$#&"), f("a*b%c")));

    expect(toHl7v2(tree)).toBe("MSH*%$#&*a#F#b#S#c\r");
  });

  it("writes a value as it is with encodeEscapes false", () => {
    const tree = m(s("PID", f("a|b")));

    expect(toHl7v2(tree, undefined, { encodeEscapes: false })).toBe(
      "PID|a|b\r"
    );
  });

  it("writes a value as it is when the compiler plugin has encodeEscapes false", () => {
    const tree = m(s("PID", f("a|b")));

    const file = unified()
      .use(hl7v2ToHl7v2, { encodeEscapes: false })
      .stringify(tree);

    expect(String(file)).toBe("PID|a|b\r");
  });
});
