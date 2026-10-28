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
