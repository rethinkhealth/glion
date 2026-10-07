import type { Segment } from "@glion/ast";

import { c, f, g, m, r, s } from "../src";

describe("builder", () => {
  describe("root", () => {
    it("should build a simple root", () => {
      const root = m();
      expect(root).toStrictEqual({
        children: [],
        type: "root",
      });
    });

    it("should build a root with a single segment", () => {
      const root = m(s("MSH", f("another value")));
      expect(root).toStrictEqual({
        children: [
          {
            children: [
              {
                children: [
                  {
                    children: [
                      {
                        children: [
                          { type: "subcomponent", value: "another value" },
                        ],
                        type: "component",
                      },
                    ],
                    type: "field-repetition",
                  },
                ],
                type: "field",
              },
            ],
            name: "MSH",
            type: "segment",
          },
        ],
        type: "root",
      });
    });

    it("should build a root with a multiple segments", () => {
      const root = m(s("MSH", f("another value")), s("PID", f("12345")));
      expect(root).toStrictEqual({
        children: [
          {
            children: [
              {
                children: [
                  {
                    children: [
                      {
                        children: [
                          { type: "subcomponent", value: "another value" },
                        ],
                        type: "component",
                      },
                    ],
                    type: "field-repetition",
                  },
                ],
                type: "field",
              },
            ],
            name: "MSH",
            type: "segment",
          },
          {
            children: [
              {
                children: [
                  {
                    children: [
                      {
                        children: [{ type: "subcomponent", value: "12345" }],
                        type: "component",
                      },
                    ],
                    type: "field-repetition",
                  },
                ],
                type: "field",
              },
            ],
            name: "PID",
            type: "segment",
          },
        ],
        type: "root",
      });
    });
  });

  describe("group", () => {
    it("should build a group with segments", () => {
      const group = g("PATIENT", s("PID", f("1")), s("PV1", f("2")));
      expect(group).toStrictEqual({
        children: [
          {
            children: [
              {
                children: [
                  {
                    children: [
                      {
                        children: [{ type: "subcomponent", value: "1" }],
                        type: "component",
                      },
                    ],
                    type: "field-repetition",
                  },
                ],
                type: "field",
              },
            ],
            name: "PID",
            type: "segment",
          },
          {
            children: [
              {
                children: [
                  {
                    children: [
                      {
                        children: [{ type: "subcomponent", value: "2" }],
                        type: "component",
                      },
                    ],
                    type: "field-repetition",
                  },
                ],
                type: "field",
              },
            ],
            name: "PV1",
            type: "segment",
          },
        ],
        id: "PATIENT",
        name: "PATIENT",
        type: "group",
      });
    });

    it("should build an empty group", () => {
      const group = g("EMPTY_GROUP");
      expect(group.type).toBe("group");
      expect(group.id).toBe("EMPTY_GROUP");
      expect(group.name).toBe("EMPTY_GROUP");
      expect(group.children).toStrictEqual([]);
    });

    it("should build a group whose name differs from its ID", () => {
      const group = g({ id: "PATIENT_VISIT", name: "Patient Visit" });
      expect(group).toStrictEqual({
        children: [],
        id: "PATIENT_VISIT",
        name: "Patient Visit",
        type: "group",
      });
    });
  });

  describe("segment", () => {
    it("should build a segment with a single-value field", () => {
      const segment = s("MSH", f("another value"));

      expect(segment).toStrictEqual({
        children: [
          {
            children: [
              {
                children: [
                  {
                    children: [
                      { type: "subcomponent", value: "another value" },
                    ],
                    type: "component",
                  },
                ],
                type: "field-repetition",
              },
            ],
            type: "field",
          },
        ],
        name: "MSH",
        type: "segment",
      });
    });

    it("should build a segment with an array of fields", () => {
      const segment = s("MSH", f("another value"), f("another value 2"));
      expect(segment).toStrictEqual({
        children: [
          {
            children: [
              {
                children: [
                  {
                    children: [
                      { type: "subcomponent", value: "another value" },
                    ],
                    type: "component",
                  },
                ],
                type: "field-repetition",
              },
            ],
            type: "field",
          },
          {
            children: [
              {
                children: [
                  {
                    children: [
                      { type: "subcomponent", value: "another value 2" },
                    ],
                    type: "component",
                  },
                ],
                type: "field-repetition",
              },
            ],
            type: "field",
          },
        ],
        name: "MSH",
        type: "segment",
      });
    });
  });

  describe("field", () => {
    it("should build an empty field with empty children", () => {
      const field = f();
      expect(field).toStrictEqual({
        children: [],
        type: "field",
      });
    });

    it("should build an empty field when passed an empty array", () => {
      const field = f([]);
      expect(field).toStrictEqual({
        children: [],
        type: "field",
      });
    });

    it("should build a single value field", () => {
      const field = f("hello world");
      expect(field).toStrictEqual({
        children: [
          {
            children: [
              {
                children: [{ type: "subcomponent", value: "hello world" }],
                type: "component",
              },
            ],
            type: "field-repetition",
          },
        ],
        type: "field",
      });
    });

    it("should build a field with a single component", () => {
      const field = f(c("hello world!"));
      expect(field).toStrictEqual({
        children: [
          {
            children: [
              {
                children: [{ type: "subcomponent", value: "hello world!" }],
                type: "component",
              },
            ],
            type: "field-repetition",
          },
        ],
        type: "field",
      });
    });

    it("should build a field with an array of components", () => {
      const field = f([c("A"), c("B"), c("C")]);

      expect(field).toStrictEqual({
        children: [
          {
            children: [
              {
                children: [{ type: "subcomponent", value: "A" }],
                type: "component",
              },
              {
                children: [{ type: "subcomponent", value: "B" }],
                type: "component",
              },
              {
                children: [{ type: "subcomponent", value: "C" }],
                type: "component",
              },
            ],
            type: "field-repetition",
          },
        ],
        type: "field",
      });
    });

    it("should build a field with an array of repeated components (field repetition)", () => {
      const field = f([
        r([c("A"), c(["B.1", "B.2"])]),
        r([c("C")]),
        r([c("D")]),
      ]);

      expect(field).toStrictEqual({
        children: [
          {
            children: [
              {
                children: [{ type: "subcomponent", value: "A" }],
                type: "component",
              },
              {
                children: [
                  { type: "subcomponent", value: "B.1" },
                  { type: "subcomponent", value: "B.2" },
                ],
                type: "component",
              },
            ],
            type: "field-repetition",
          },
          {
            children: [
              {
                children: [{ type: "subcomponent", value: "C" }],
                type: "component",
              },
            ],
            type: "field-repetition",
          },
          {
            children: [
              {
                children: [{ type: "subcomponent", value: "D" }],
                type: "component",
              },
            ],
            type: "field-repetition",
          },
        ],
        type: "field",
      });
    });

    it("should build the same results using a single repetition or component(s)", () => {
      const fieldWithRepetition = f(r(c("A"), c(["B.1", "B.2"])));
      const fieldWithComponents = f(c("A"), c(["B.1", "B.2"]));
      expect(fieldWithRepetition).toStrictEqual(fieldWithComponents);
    });
  });

  describe("repetition", () => {
    it("should build an empty repetition with empty children", () => {
      const rep = r();
      expect(rep).toStrictEqual({
        children: [],
        type: "field-repetition",
      });
    });

    it("should build an empty repetition when passed an empty array", () => {
      const rep = r([]);
      expect(rep).toStrictEqual({
        children: [],
        type: "field-repetition",
      });
    });

    it("should build a repetition with a single value", () => {
      const rep = r("A");
      expect(rep).toStrictEqual({
        children: [
          {
            children: [{ type: "subcomponent", value: "A" }],
            type: "component",
          },
        ],
        type: "field-repetition",
      });
    });
  });

  describe("component", () => {
    it("should build an empty component with empty children", () => {
      const component = c();
      expect(component).toStrictEqual({
        children: [],
        type: "component",
      });
    });

    it("should build an empty component when passed an empty array", () => {
      const component = c([]);
      expect(component).toStrictEqual({
        children: [],
        type: "component",
      });
    });

    it("should build a component with a single value", () => {
      const component = c("hello world!");
      expect(component).toStrictEqual({
        children: [{ type: "subcomponent", value: "hello world!" }],
        type: "component",
      });
    });

    it("should build a component with an array of values", () => {
      const component = c(["hello world!", "hello world 2!"]);
      expect(component).toStrictEqual({
        children: [
          { type: "subcomponent", value: "hello world!" },
          { type: "subcomponent", value: "hello world 2!" },
        ],
        type: "component",
      });
    });
  });

  describe("complex scenarios", () => {
    it("should build a segment with an array of fields, each with an array of components", () => {
      const message = m(
        // MSH Segment
        s(
          "MSH",
          f(),
          f(),
          f("1234"),
          f([c(["A", "A.2", "A.3"]), c("B"), c("C")])
        ),
        // PID Segment
        s("PID", f("12345"), f([c("DOE"), c("JOHN")]))
      );

      expect(message).toMatchSnapshot();
    });

    it("should build a segment with mixed empty and non-empty fields", () => {
      // Simulating: PID|||ID^^^FAC^MR||
      const message = m(
        s(
          "PID",
          f(), // PID.1 empty
          f(), // PID.2 empty
          f([
            // PID.3: ID^^^FAC^MR
            c("ID"),
            c(), // empty component
            c(), // empty component
            c("FAC"),
            c("MR"),
          ]),
          f() // PID.4 empty
        )
      );

      const seg = message.children[0] as Segment;
      expect(seg.children).toHaveLength(4);

      expect(seg.children[0]).toStrictEqual({ children: [], type: "field" });
      expect(seg.children[1]).toStrictEqual({ children: [], type: "field" });

      expect(seg.children[2]).toStrictEqual({
        children: [
          {
            children: [
              {
                children: [{ type: "subcomponent", value: "ID" }],
                type: "component",
              },
              { children: [], type: "component" },
              { children: [], type: "component" },
              {
                children: [{ type: "subcomponent", value: "FAC" }],
                type: "component",
              },
              {
                children: [{ type: "subcomponent", value: "MR" }],
                type: "component",
              },
            ],
            type: "field-repetition",
          },
        ],
        type: "field",
      });

      expect(seg.children[3]).toStrictEqual({ children: [], type: "field" });
    });

    it("should build a field with empty repetitions", () => {
      const field = f([r(), r()]);
      expect(field).toStrictEqual({
        children: [
          { children: [], type: "field-repetition" },
          { children: [], type: "field-repetition" },
        ],
        type: "field",
      });
    });

    it("should handle mixed empty and non-empty repetitions", () => {
      // A~~ (first has content, second and third are empty)
      const field = f([r("A"), r(), r()]);
      expect(field).toStrictEqual({
        children: [
          {
            children: [
              {
                children: [{ type: "subcomponent", value: "A" }],
                type: "component",
              },
            ],
            type: "field-repetition",
          },
          { children: [], type: "field-repetition" },
          { children: [], type: "field-repetition" },
        ],
        type: "field",
      });
    });
  });
});
