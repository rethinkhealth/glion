import type { Field } from "@glion/ast";
import { f, g, m, s } from "@glion/builder";
import { DEFAULT_DELIMITERS } from "@glion/utils";

import { delimiters, header } from "../src";

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

  it("has the default delimiters for a message header segment with no fields", () => {
    expect(delimiters(m(s("MSH")))).toStrictEqual(DEFAULT_DELIMITERS);
  });

  it("declares only the field separator when MSH-2 is missing", () => {
    const tree = m(s("MSH", f("*")));
    expect(delimiters(tree)).toStrictEqual({ field: "*" });
  });

  it("declares only the field separator when MSH-2 is empty", () => {
    const tree = m(s("MSH", f("|"), f("")));
    expect(delimiters(tree)).toStrictEqual({ field: "|" });
  });

  it("declares no escape character and no subcomponent separator when MSH-2 has 2 characters", () => {
    const tree = m(s("MSH", f("|"), f("^~")));
    expect(delimiters(tree)).toStrictEqual({
      component: "^",
      field: "|",
      repetition: "~",
    });
  });

  // HL7v2 v2.5.1 §2.5.4: the subcomponent separator may be omitted when the
  // message has no subcomponents. `&` is then the escape character, not also
  // the subcomponent separator (#1170).
  it("declares no subcomponent separator when MSH-2 has 3 characters", () => {
    const tree = m(s("MSH", f("|"), f("^~&")));
    expect(delimiters(tree)).toStrictEqual({
      component: "^",
      escape: "&",
      field: "|",
      repetition: "~",
    });
  });

  it("ignores extra characters beyond 4 in MSH-2", () => {
    const tree = m(s("MSH", f("|"), f("^~\\&XYZ")));
    expect(delimiters(tree)).toStrictEqual(DEFAULT_DELIMITERS);
  });

  it("accepts a multi-byte character in MSH-2", () => {
    const tree = m(s("MSH", f("|"), f("^~\\é")));
    expect(delimiters(tree).subcomponent).toBe("é");
  });

  it("reads MSH-2 by UTF-16 code unit, as the parser does", () => {
    const tree = m(s("MSH", f("|"), f("💀~\\&")));
    expect(delimiters(tree).escape).toBe("~");
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

  it("reads a field with no value as no delimiter, at every level of the field", () => {
    const declared = (msh2: Field) => delimiters(m(s("MSH", f("*"), msh2)));
    const emptyField: Field = { children: [], type: "field" };
    const noComponent: Field = {
      children: [{ children: [], type: "field-repetition" }],
      type: "field",
    };
    const noSubcomponent: Field = {
      children: [
        {
          children: [{ children: [], type: "component" }],
          type: "field-repetition",
        },
      ],
      type: "field",
    };

    for (const msh2 of [emptyField, noComponent, noSubcomponent]) {
      expect(declared(msh2)).toStrictEqual({ field: "*" });
    }
  });

  it("has the field separator `|` when MSH-1 holds no value", () => {
    const tree = m(s("MSH", { children: [], type: "field" }, f("^~\\&")));
    expect(delimiters(tree)).toStrictEqual(DEFAULT_DELIMITERS);
  });

  it("reads the delimiters of a message header inside a Group node", () => {
    const tree = m(g("HEADER", s("MSH", f("*"), f("%$#&"), f("SENDER"))));
    expect(delimiters(tree)).toStrictEqual({
      component: "%",
      escape: "#",
      field: "*",
      repetition: "$",
      subcomponent: "&",
    });
  });

  it("prefers top-level MSH over MSH inside a Group", () => {
    const tree = m(
      s("MSH", f("*"), f("%$#&"), f("TOP")),
      g("HEADER", s("MSH", f("|"), f("^~\\&"), f("NESTED")))
    );
    expect(delimiters(tree).field).toBe("*");
  });
});

describe("delimiters of a message without a message header", () => {
  const custom = {
    component: "%",
    escape: "#",
    field: "*",
    repetition: "$",
    subcomponent: "@",
  };

  it("has the fallback, over the default delimiters", () => {
    expect(delimiters(m(s("PID")), custom)).toStrictEqual(custom);
    expect(delimiters(m(s("PID")), { field: "*" })).toStrictEqual({
      ...DEFAULT_DELIMITERS,
      field: "*",
    });
  });

  it("has the fallback for a message header segment with no fields", () => {
    expect(delimiters(m(s("MSH")), custom)).toStrictEqual(custom);
  });

  it("keeps a message header over the fallback", () => {
    expect(delimiters(m(s("MSH", f("|"), f("^~&"))), custom)).toStrictEqual({
      component: "^",
      escape: "&",
      field: "|",
      repetition: "~",
    });
  });
});

describe(header, () => {
  it("is the first segment when it is MSH", () => {
    const tree = m(s("MSH", f("|")), s("PID"));
    expect(header(tree)).toBe(tree.children[0]);
  });

  it("is found after empty lines", () => {
    const tree = m(s(""), s(""), s("MSH", f("|")));
    expect(header(tree)).toBe(tree.children[2]);
  });

  it("is found inside a segment group", () => {
    const msh = s("MSH", f("|"));
    expect(header(m(g("ROOT", g("HEADER", msh))))).toBe(msh);
  });

  it("is looked for past an empty segment group", () => {
    const msh = s("MSH", f("|"));
    expect(header(m(g("EMPTY"), msh))).toBe(msh);
  });

  it("is looked for past a node that is not a segment", () => {
    const msh = s("MSH", f("*"));
    const tree = m(msh);
    tree.children.unshift({ type: "comment", value: "x" } as never);

    expect(header(tree)).toBe(msh);
    expect(delimiters(tree).field).toBe("*");
  });

  it("is `undefined` when the message opens with another segment", () => {
    expect(header(m(s("PID"), s("MSH", f("|"))))).toBeUndefined();
    expect(header(m(s("", f("A")), s("MSH", f("|"))))).toBeUndefined();
  });

  it("is `undefined` for a message with no segments", () => {
    expect(header(m())).toBeUndefined();
    expect(header(m(s("")))).toBeUndefined();
  });
});
