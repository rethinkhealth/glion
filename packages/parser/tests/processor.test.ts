import type { Segment } from "@glion/ast";

import { parseHL7v2FromIterator } from "../src/processor";
import type { Token } from "../src/types";

function segEnd(pos = 0): Token {
  return {
    position: {
      end: { column: 1, line: 1, offset: pos },
      start: { column: 1, line: 1, offset: pos },
    },
    type: "SEGMENT_END",
  } as Token;
}

function text(value: string, pos = 0): Token {
  return {
    position: {
      end: { column: 1, line: 1, offset: pos + value.length },
      start: { column: 1, line: 1, offset: pos },
    },
    type: "TEXT",
    value,
  } as Token;
}

function tok(
  type: Exclude<Token["type"], "TEXT" | "SEGMENT_END">,
  pos = 0
): Token {
  return {
    position: {
      end: { column: 1, line: 1, offset: pos + 1 },
      start: { column: 1, line: 1, offset: pos },
    },
    type,
  } as Token;
}

describe("processor (semantics-agnostic)", () => {
  it("builds segment -> field -> repetition -> component -> subcomponents from tokens (sync iterator)", () => {
    const tokens: Token[] = [
      text("PID"),
      tok("FIELD_DELIM"),
      text("1"),
      segEnd(),
    ];
    const root = parseHL7v2FromIterator(tokens);
    expect(root.children).toHaveLength(1);
    const seg = root.children[0] as Segment;
    expect(seg.type).toBe("segment");
    expect(seg.name).toBe("PID");
    expect(seg.children).toHaveLength(1); // field "1"
    expect(
      seg.children[0].children?.[0].children?.[0].children?.[0].value
    ).toBe("1");
  });

  it("handles leading FIELD_DELIM by creating an empty first field", () => {
    // SEG||A => TEXT("SEG"), FIELD_DELIM (consumed), FIELD_DELIM (creates empty field), TEXT("A")
    const tokens: Token[] = [
      text("SEG"),
      tok("FIELD_DELIM"), // This one is skipped (separates segment name from fields)
      tok("FIELD_DELIM"), // This one creates an empty first field
      text("A"),
      segEnd(),
    ];
    const root = parseHL7v2FromIterator(tokens);
    const seg = root.children[0] as Segment;
    expect(seg.children).toHaveLength(2);
    // first field first subcomponent should be empty string
    expect(seg.children[0].children).toHaveLength(0); // Since we are in `empty` mode, the field is left without children.
    expect(
      seg.children[1].children?.[0].children?.[0].children?.[0].value
    ).toBe("A");
  });

  it("supports repetition and components", () => {
    const tokens: Token[] = [
      text("SEG"),
      tok("FIELD_DELIM"),
      text("X"),
      tok("REPETITION_DELIM"),
      text("Y"),
      tok("COMPONENT_DELIM"),
      text("Z"),
      segEnd(),
    ];
    const root = parseHL7v2FromIterator(tokens);
    const seg = root.children[0] as Segment;
    expect(seg.children).toHaveLength(1);
    const field = seg.children[0];
    expect(field.children).toHaveLength(2); // two repetitions
    const rep1 = field.children[0];
    const rep2 = field.children[1];
    expect(rep1.children?.[0].children?.[0].value).toBe("X");
    expect(rep2.children?.[0].children?.[0].value).toBe("Y");
    expect(rep2.children?.[1].children?.[0].value).toBe("Z");
  });

  it("sUBCOMP_DELIM starts a new empty subcomponent slot", () => {
    const tokens: Token[] = [
      text("SEG"),
      tok("FIELD_DELIM"),
      text("A"),
      tok("SUBCOMP_DELIM"),
      text("B"),
      segEnd(),
    ];
    const root = parseHL7v2FromIterator(tokens);
    const seg = root.children[0] as Segment;
    const comps = seg.children[0].children?.[0].children?.[0];
    const subs = comps?.children;
    expect(subs).toHaveLength(2);
    expect(subs[0].value).toBe("A");
    expect(subs[1].value).toBe("B");
  });

  it("finalizes last segment without trailing SEGMENT_END (sync tokens)", () => {
    const tokens: Token[] = [text("PID"), tok("FIELD_DELIM"), text("1")];
    const root = parseHL7v2FromIterator(tokens);
    expect(root.children).toHaveLength(1);
    const seg = root.children[0] as Segment;
    expect(seg.children).toHaveLength(1);
  });

  it("handles empty line (segment with no fields) by dropping the empty trailing segment", () => {
    const root = parseHL7v2FromIterator([segEnd()]);
    expect(root.children).toHaveLength(0);
  });

  it("keeps a trailing named-but-fieldless segment (round-trip idempotency)", () => {
    // Regression test for a fuzz-found round-trip break: the parser
    // used to drop any trailing segment with `!segmentHasContent`,
    // which silently discarded segments whose payload (after the
    // segment name) contained no recognised delimiters under the
    // current delimiter set. Once dropped, the segment immediately
    // before it shifted into the trailing position and got dropped on
    // the next parse — cascading data loss across round-trips. Keep
    // named-only segments so the serialized form re-parses to the
    // same tree.
    const tokens: Token[] = [
      text("PID"),
      tok("FIELD_DELIM"),
      text("1"),
      segEnd(),
      text("AAA-no-fields-here"),
    ];
    const root = parseHL7v2FromIterator(tokens);
    expect(root.children).toHaveLength(2);
    expect((root.children[1] as Segment).name).toBe("AAA-no-fields-here");
    expect((root.children[1] as Segment).children).toHaveLength(0);
  });

  it("drops only the final trailing empty field but preserves preceding empty fields", () => {
    const tokens: Token[] = [
      text("PID"),
      tok("FIELD_DELIM"),
      text("1"),
      tok("FIELD_DELIM"),
      tok("FIELD_DELIM"),
      segEnd(),
    ];
    const root = parseHL7v2FromIterator(tokens);
    const seg = root.children[0] as Segment;
    expect(seg.children).toHaveLength(2); // 1, ''
    expect(seg.children[0].children?.[0].children.length).toBe(1);
    expect(seg.children[1]).toMatchObject({
      children: [],
      type: "field",
    });
  });

  it("does not add a new field when segment ends with a single FIELD_DELIM", () => {
    const tokens: Token[] = [
      text("PID"),
      tok("FIELD_DELIM"),
      text("1"),
      tok("FIELD_DELIM"),
      segEnd(),
    ];
    const root = parseHL7v2FromIterator(tokens);
    const seg = root.children[0] as Segment;
    expect(seg.children).toHaveLength(1);
  });

  it("keeps trailing empty component when COMPONENT_DELIM is last before SEGMENT_END", () => {
    const tokens: Token[] = [
      text("PID"),
      tok("FIELD_DELIM"),
      text("A"),
      tok("COMPONENT_DELIM"),
      segEnd(),
    ];
    const root = parseHL7v2FromIterator(tokens);
    const seg = root.children[0] as Segment;
    expect(seg.children[0]).toMatchObject({
      children: [
        {
          children: [
            {
              children: [
                {
                  type: "subcomponent",
                  value: "A",
                },
              ],
              type: "component",
            },
            {
              children: [],
              type: "component", // This is empty
            },
          ],
          type: "field-repetition",
        },
      ],
      type: "field",
    });
  });

  it("keeps trailing empty subcomponent when SUBCOMP_DELIM is last before SEGMENT_END", () => {
    const tokens: Token[] = [
      text("PID"),
      tok("FIELD_DELIM"),
      text("A"),
      tok("SUBCOMP_DELIM"),
      segEnd(),
    ];
    const root = parseHL7v2FromIterator(tokens);
    const seg = root.children[0] as Segment;
    expect(seg.children).toHaveLength(1);

    // Make sure that the subcomponent exists
    expect(seg.children[0]).toMatchObject({
      children: [
        {
          children: [
            {
              children: [
                {
                  type: "subcomponent",
                  value: "A",
                },
                {
                  type: "subcomponent",
                  value: "",
                },
              ],
              type: "component",
            },
          ],
          type: "field-repetition",
        },
      ],
      type: "field",
    });
  });

  it("keeps trailing empty repetition when REPETITION_DELIM is last before SEGMENT_END", () => {
    const tokens: Token[] = [
      text("OBX"),
      tok("FIELD_DELIM"),
      text("1"),
      tok("REPETITION_DELIM"),
      segEnd(),
    ];
    const root = parseHL7v2FromIterator(tokens);
    const seg = root.children[0] as Segment;
    const field = seg.children[0];
    expect(field.children).toHaveLength(2);
    const lastRep = field.children[1];
    expect(lastRep).toMatchObject({
      children: [],
      type: "field-repetition",
    });
  });
});
