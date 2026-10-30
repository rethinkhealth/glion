import { f, g, m, s } from "@glion/builder";
import { DEFAULT_DELIMITERS } from "@glion/utils";

import { delimiters } from "../src";

describe("delimiters", () => {
  // --- Standard cases ---

  it("extracts standard delimiters from MSH-1 and MSH-2", () => {
    const tree = m(s("MSH", f("|"), f("^~\\&"), f("SENDER")));
    expect(delimiters(tree)).toStrictEqual(DEFAULT_DELIMITERS);
  });

  it("extracts custom delimiters from MSH-1 and MSH-2", () => {
    const tree = m(s("MSH", f("*"), f("%$#&"), f("SENDER")));
    expect(delimiters(tree)).toStrictEqual({
      component: "%",
      escape: "#",
      field: "*",
      repetition: "$",
      subcomponent: "&",
    });
  });

  it("returns DEFAULT_DELIMITERS when no MSH segment exists", () => {
    expect(delimiters(m(s("PID", f("12345"))))).toStrictEqual(
      DEFAULT_DELIMITERS
    );
  });

  it("returns DEFAULT_DELIMITERS for empty root", () => {
    expect(delimiters(m())).toStrictEqual(DEFAULT_DELIMITERS);
  });

  it("finds MSH even when it is not the first segment", () => {
    const tree = m(
      s("PID", f("12345")),
      s("MSH", f("|"), f("^~\\&"), f("SENDER"))
    );
    expect(delimiters(tree)).toStrictEqual(DEFAULT_DELIMITERS);
  });

  // --- MSH-1 edge cases ---

  it("rejects MSH-1 with multi-character value", () => {
    const tree = m(s("MSH", f("||"), f("^~\\&")));
    expect(delimiters(tree).field).toBe("|");
  });

  it("handles MSH-1 with empty string value", () => {
    const tree = m(s("MSH", f(""), f("^~\\&")));
    expect(delimiters(tree).field).toBe("|");
  });

  it("rejects MSH-1 with multi-byte character", () => {
    const tree = m(s("MSH", f("💀"), f("^~\\&")));
    expect(delimiters(tree).field).toBe("|");
  });

  // --- MSH-2 edge cases ---

  it("handles MSH with missing MSH-2", () => {
    const tree = m(s("MSH", f("*")));
    expect(delimiters(tree)).toStrictEqual({
      ...DEFAULT_DELIMITERS,
      field: "*",
    });
  });

  it("handles MSH-2 with empty string value", () => {
    const tree = m(s("MSH", f("|"), f("")));
    expect(delimiters(tree)).toStrictEqual(DEFAULT_DELIMITERS);
  });

  it("handles MSH-2 with fewer than 4 characters", () => {
    const tree = m(s("MSH", f("|"), f("^~")));
    expect(delimiters(tree)).toStrictEqual({
      ...DEFAULT_DELIMITERS,
      component: "^",
      repetition: "~",
    });
  });

  it("ignores extra characters beyond 4 in MSH-2", () => {
    const tree = m(s("MSH", f("|"), f("^~\\&XYZ")));
    expect(delimiters(tree)).toStrictEqual(DEFAULT_DELIMITERS);
  });

  it("accepts multi-byte characters in MSH-2", () => {
    const tree = m(s("MSH", f("|"), f("^~\\💀")));
    expect(delimiters(tree).subcomponent).toBe("💀");
  });

  // --- Duplicate/collision cases (resolved, not validated) ---

  it("resolves duplicate MSH-2 characters without rejecting", () => {
    const tree = m(s("MSH", f("|"), f("^^^^")));
    const result = delimiters(tree);
    expect(result.component).toBe("^");
    expect(result.repetition).toBe("^");
    expect(result.escape).toBe("^");
    expect(result.subcomponent).toBe("^");
  });

  it("resolves MSH-1 collision with MSH-2 without rejecting", () => {
    const tree = m(s("MSH", f("^"), f("^~\\&")));
    const result = delimiters(tree);
    expect(result.field).toBe("^");
    expect(result.component).toBe("^");
  });

  it("resolves all-unique custom delimiters", () => {
    const tree = m(s("MSH", f("#"), f("@!$%")));
    expect(delimiters(tree)).toStrictEqual({
      component: "@",
      escape: "$",
      field: "#",
      repetition: "!",
      subcomponent: "%",
    });
  });

  // --- Multiple MSH segments ---

  it("uses the first MSH segment when multiple exist", () => {
    const tree = m(
      s("MSH", f("*"), f("%$#&"), f("FIRST")),
      s("PID", f("12345")),
      s("MSH", f("|"), f("^~\\&"), f("SECOND"))
    );
    expect(delimiters(tree).field).toBe("*");
    expect(delimiters(tree).component).toBe("%");
  });

  // --- MSH inside Groups ---

  it("finds MSH inside a Group node", () => {
    const tree = m(g("HEADER", s("MSH", f("|"), f("^~\\&"), f("SENDER"))));
    expect(delimiters(tree)).toStrictEqual(DEFAULT_DELIMITERS);
  });

  it("prefers top-level MSH over MSH inside a Group", () => {
    const tree = m(
      s("MSH", f("*"), f("%$#&"), f("TOP")),
      g("HEADER", s("MSH", f("|"), f("^~\\&"), f("NESTED")))
    );
    expect(delimiters(tree).field).toBe("*");
  });
});
