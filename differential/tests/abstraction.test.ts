import type { Root } from "@glion/ast";
import { hl7v2Parser } from "@glion/parser";
import { unified } from "unified";

import { toSpecMessage } from "../src/abstraction";

const parser = unified().use(hl7v2Parser);

describe("toSpecMessage", () => {
  it("maps MSH-1 and MSH-2 to the delimiters and the rest of MSH to the header", () => {
    expect(toSpecMessage(parser.parse("MSH|^~\\&|a|b\r"))).toEqual({
      delimiters: "|^~\\&",
      header: [[[["a"]]], [[["b"]]]],
      segments: [],
    });
  });

  it("keeps the delimiters in MSH-2 order when they are not the suggested ones", () => {
    // Field `#`, component `|`, repetition `&`, escape `~`, subcomponent `^`.
    expect(toSpecMessage(parser.parse("MSH#|&~^#a|b&c^d\r"))).toEqual({
      delimiters: "#|&~^",
      header: [[[["a"], ["b"]], [["c", "d"]]]],
      segments: [],
    });
  });

  it("maps an MSH with nothing after MSH-2 to an empty header", () => {
    expect(toSpecMessage(parser.parse("MSH|^~\\&\r"))).toEqual({
      delimiters: "|^~\\&",
      header: [],
      segments: [],
    });
  });

  it("maps each later segment to its Segment ID and its fields from field 1", () => {
    expect(
      toSpecMessage(parser.parse("MSH|^~\\&\rPID|1|Smith^John\rPV1|I\r"))
        .segments
    ).toEqual([
      { fields: [[[["1"]]], [[["Smith"], ["John"]]]], id: "PID" },
      { fields: [[[["I"]]]], id: "PV1" },
    ]);
  });

  it("maps a segment with no fields to no fields", () => {
    expect(toSpecMessage(parser.parse("MSH|^~\\&\rZZZ\r")).segments).toEqual([
      { fields: [], id: "ZZZ" },
    ]);
  });

  it("maps an empty component to one empty subcomponent", () => {
    expect(
      toSpecMessage(parser.parse("MSH|^~\\&\rPID|1^^2\r")).segments
    ).toEqual([{ fields: [[[["1"], [""], ["2"]]]], id: "PID" }]);
  });

  it("maps an empty repetition to one empty component", () => {
    expect(toSpecMessage(parser.parse("MSH|^~\\&\rPID|x~\r")).segments).toEqual(
      [{ fields: [[[["x"]], [[""]]]], id: "PID" }]
    );
  });

  it("maps an empty field to one empty repetition", () => {
    expect(
      toSpecMessage(parser.parse("MSH|^~\\&\rPID|a||b\r")).segments
    ).toEqual([{ fields: [[[["a"]]], [[[""]]], [[["b"]]]], id: "PID" }]);
  });

  it("keeps an empty subcomponent between two others", () => {
    expect(
      toSpecMessage(parser.parse("MSH|^~\\&\rPID|a&&b\r")).segments
    ).toEqual([{ fields: [[[["a", "", "b"]]]], id: "PID" }]);
  });

  it("reads a sequence glion kept in a value as an escape sequence", () => {
    expect(
      toSpecMessage(parser.parse("MSH|^~\\&\rOBX|\\H\\240*\\N\\\r")).segments
    ).toEqual([
      {
        fields: [[[[[{ sequence: "H" }, "240*", { sequence: "N" }]]]]],
        id: "OBX",
      },
    ]);
  });

  it("reads the carriage return glion decodes from \\.br\\ as that sequence", () => {
    expect(
      toSpecMessage(parser.parse("MSH|^~\\&\rOBX|a\\.br\\b\r")).segments
    ).toEqual([{ fields: [[[[["a", { sequence: ".br" }, "b"]]]]], id: "OBX" }]);
  });

  it("reads a delimiter glion decoded as data", () => {
    expect(
      toSpecMessage(parser.parse("MSH|^~\\&\rOBX|a\\T\\b\r")).segments
    ).toEqual([{ fields: [[[["a&b"]]]], id: "OBX" }]);
  });

  it("reads an escape character with no closing one as data", () => {
    expect(
      toSpecMessage(parser.parse("MSH|^~\\&\rOBX|a\\E\\b\r")).segments
    ).toEqual([{ fields: [[[["a\\b"]]]], id: "OBX" }]);
  });

  // Each tree below is written as the same text as the parser's empty node,
  // and would map to the same message.
  it("throws on a field whose only repetition is empty", () => {
    const tree = parser.parse("MSH|^~\\&\rPID|x\r");
    const [, pid] = tree.children;
    if (pid?.type !== "segment") {
      throw new Error("The parser did not return PID.");
    }
    pid.children = [
      { children: [{ children: [], type: "field-repetition" }], type: "field" },
    ];

    expect(() => toSpecMessage(tree)).toThrow(
      "The tree holds a field whose only repetition is empty; the parser writes an empty field with no repetitions."
    );
  });

  it("throws on a repetition whose only component is empty", () => {
    const tree = parser.parse("MSH|^~\\&\rPID|x\r");
    const [, pid] = tree.children;
    if (pid?.type !== "segment") {
      throw new Error("The parser did not return PID.");
    }
    pid.children = [
      {
        children: [
          {
            children: [{ children: [], type: "component" }],
            type: "field-repetition",
          },
        ],
        type: "field",
      },
    ];

    expect(() => toSpecMessage(tree)).toThrow(
      "The tree holds a repetition whose only component is empty; the parser writes an empty repetition with no components."
    );
  });

  it("throws on a component whose only subcomponent is empty", () => {
    const tree = parser.parse("MSH|^~\\&\rPID|x\r");
    const [, pid] = tree.children;
    if (pid?.type !== "segment") {
      throw new Error("The parser did not return PID.");
    }
    pid.children = [
      {
        children: [
          {
            children: [
              {
                children: [{ type: "subcomponent", value: "" }],
                type: "component",
              },
            ],
            type: "field-repetition",
          },
        ],
        type: "field",
      },
    ];

    expect(() => toSpecMessage(tree)).toThrow(
      "The tree holds a component whose only subcomponent is empty; the parser writes an empty component with no subcomponents."
    );
  });

  it("throws on a last segment with no segment terminator", () => {
    expect(() => toSpecMessage(parser.parse("MSH|^~\\&\rPID|1"))).toThrow(
      "The tree holds a segment that does not end with a carriage return; the specification ends every segment with one."
    );
  });

  it("throws on a segment that ends with a line feed", () => {
    expect(() => toSpecMessage(parser.parse("MSH|^~\\&\nPID|1\r"))).toThrow(
      "The tree holds a segment that does not end with a carriage return; the specification ends every segment with one."
    );
  });

  it("throws on a segment that ends with a carriage return and a line feed", () => {
    expect(() => toSpecMessage(parser.parse("MSH|^~\\&\rPID|1\r\n"))).toThrow(
      "The tree holds a segment that does not end with a carriage return; the specification ends every segment with one."
    );
  });

  it("throws on a tree with no segment", () => {
    const tree: Root = { children: [], type: "root" };

    expect(() => toSpecMessage(tree)).toThrow(
      "The tree does not start with an MSH segment."
    );
  });

  it("throws on a tree whose first segment is not MSH", () => {
    expect(() => toSpecMessage(parser.parse("PID|1\r"))).toThrow(
      "The tree does not start with an MSH segment."
    );
  });

  it("throws on a tree that holds a segment group", () => {
    const tree = parser.parse("MSH|^~\\&\rPID|1\r");
    const [msh, pid] = tree.children;
    if (msh === undefined || pid?.type !== "segment") {
      throw new Error("The parser did not return MSH and PID.");
    }
    tree.children = [
      msh,
      { children: [pid], id: "PATIENT", name: "Patient", type: "group" },
    ];

    expect(() => toSpecMessage(tree)).toThrow(
      "The tree holds a group; parse without grouping."
    );
  });
});
