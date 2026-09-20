import type { Group, Nodes, Segment } from "@glion/ast";
import { c, f, g, m, s } from "@glion/builder";

import type { VisitInfo } from "../src";
import { EXIT, SKIP, visit } from "../src";

describe("visit", () => {
  it("should visit all nodes in order", () => {
    const ast = m(
      s("MSH", f(c()), f()),
      g("PATIENT_GROUP", s("PID", f())),
      s("NK1")
    );
    const visitedNodes: string[] = [];
    visit(ast, (node) => {
      visitedNodes.push(node.type);
    });

    expect(visitedNodes).toStrictEqual([
      "root",
      "segment",
      "field",
      "field-repetition",
      "component",
      "field",
      "group",
      "segment",
      "field",
      "segment",
    ]);
  });

  it("should filter nodes by type string", () => {
    const ast = m(
      s("MSH", f(c()), f()),
      g("PATIENT_GROUP", s("PID", f())),
      s("NK1")
    );
    const visitedSegments: string[] = [];
    visit(ast, "segment", (node) => {
      visitedSegments.push(node.type);
    });
    expect(visitedSegments).toStrictEqual(["segment", "segment", "segment"]);
  });

  it("should filter nodes by object properties", () => {
    const ast = m(
      s("MSH", f(c()), f()),
      g("PATIENT_GROUP", s("PID", f())),
      s("NK1")
    );
    const visitedNodes: string[] = [];
    visit(ast, { name: "PATIENT_GROUP" }, (node) => {
      visitedNodes.push((node as Group).name || "");
    });
    expect(visitedNodes).toStrictEqual(["PATIENT_GROUP"]);
  });

  it("should filter nodes with a test function", () => {
    const ast = m(
      s("MSH", f(c()), f()),
      g("PATIENT_GROUP", s("PID", f())),
      s("NK1")
    );
    const visitedFields: string[] = [];
    visit(
      ast,
      (node) => node.type === "field",
      (node) => {
        visitedFields.push(node.type);
      }
    );
    expect(visitedFields).toStrictEqual(["field", "field", "field"]);
  });

  it("should stop traversal when visitor returns EXIT", () => {
    const ast = m(
      s("MSH", f(c()), f()),
      g("PATIENT_GROUP", s("PID", f())),
      s("NK1")
    );
    const visitedNodes: string[] = [];
    visit(ast, (node) => {
      visitedNodes.push(node.type);
      // oxlint-disable-next-line jest/no-conditional-in-test
      if (node.type === "group") {
        return EXIT;
      }
    });
    expect(visitedNodes).toStrictEqual([
      "root",
      "segment",
      "field",
      "field-repetition",
      "component",
      "field",
      "group",
    ]);
  });

  it("should skip children when visitor returns SKIP", () => {
    const ast = m(
      s("MSH", f(c()), f()),
      g("PATIENT_GROUP", s("PID", f())),
      s("NK1")
    );
    const visitedNodes: string[] = [];
    visit(ast, (node) => {
      visitedNodes.push(node.type);
      if (node.type === "segment" && node.name === "MSH") {
        return SKIP;
      }
    });
    expect(visitedNodes).toStrictEqual([
      "root",
      "segment", // MSH is visited
      // MSH children are skipped
      "group",
      "segment",
      "field",
      "segment",
    ]);
  });

  describe("visitInfo structure", () => {
    it("should provide correct info with index, sequence, and depth", () => {
      const ast = m(
        s("MSH", f(c("value1")), f("value2")),
        g("PATIENT_GROUP", s("PID", f(c("value3")))),
        s("NK1")
      );
      const infos: { info: VisitInfo; ancestors: Nodes[] }[] = [];
      visit(ast, "component", (_node, ancestors, info) => {
        infos.push({ ancestors: [...ancestors], info: { ...info } });
      });

      // Should find 3 components total
      expect(infos).toHaveLength(3);

      // First component (value1) in MSH field 1
      const first = infos[0];
      expect(first?.info.depth).toBe(5); // root > segment > field > field-repetition > component
      expect(first?.info.index).toBe(0);
      expect(first?.info.sequence).toBe(1);
      expect(first?.ancestors).toHaveLength(4); // parents, not including self

      // Check ancestors
      expect(first?.ancestors[0]?.type).toBe("root");
      expect(first?.ancestors[1]?.type).toBe("segment");
      expect(first?.ancestors[2]?.type).toBe("field");
      expect(first?.ancestors[3]?.type).toBe("field-repetition");

      // Second component (value2) in MSH field 2
      const second = infos[1];
      expect(second?.info.depth).toBe(5);
      expect(second?.info.index).toBe(0); // First component in its field-repetition
      expect(second?.info.sequence).toBe(1);

      // Third component (value3) in PID field 1 inside PATIENT_GROUP
      const third = infos[2];
      expect(third?.info.depth).toBe(6); // root > group > segment > field > field-repetition > component
      expect(third?.ancestors).toHaveLength(5);
      expect(third?.ancestors[1]?.type).toBe("group");
    });

    it("should provide metadata for segments", () => {
      const ast = m(
        s("MSH", f(c()), f()),
        g("PATIENT_GROUP", s("PID", f())),
        s("NK1")
      );
      const names: string[] = [];
      visit(ast, "segment", (_node, _ancestors, info) => {
        if (info.metadata?.name) {
          names.push(info.metadata.name as string);
        }
      });
      expect(names).toStrictEqual(["MSH", "PID", "NK1"]);
    });

    it("should provide metadata for groups", () => {
      const ast = m(
        s("MSH", f(c()), f()),
        g("PATIENT_GROUP", s("PID", f())),
        s("NK1")
      );
      visit(ast, "group", (_node, _ancestors, info) => {
        expect(info.metadata?.name).toBe("PATIENT_GROUP");
      });
    });

    it("should have empty ancestors for root node", () => {
      const ast = m(
        s("MSH", f(c()), f()),
        g("PATIENT_GROUP", s("PID", f())),
        s("NK1")
      );
      visit(ast, "root", (_node, ancestors, info) => {
        expect(ancestors).toStrictEqual([]);
        expect(info.depth).toBe(1);
        expect(info.index).toBe(0);
        expect(info.sequence).toBe(1);
      });
    });

    it("should track parent hierarchy correctly via ancestors", () => {
      const ast = m(
        s("MSH", f(c()), f()),
        g("PATIENT_GROUP", s("PID", f())),
        s("NK1")
      );
      visit(ast, "segment", (node, ancestors) => {
        if (node.name === "PID") {
          // PID is inside PATIENT_GROUP
          const types = ancestors.map((a) => a.type);
          expect(types).toStrictEqual(["root", "group"]);

          // Check parent is group
          const parent = ancestors.at(-1) as Group;
          expect(parent.type).toBe("group");
          expect(parent.name).toBe("PATIENT_GROUP");
        }
      });
    });

    it("should correctly track depth in nested structure", () => {
      const ast = m(
        s("MSH", f(c()), f()),
        g("PATIENT_GROUP", s("PID", f())),
        s("NK1")
      );
      const depths: number[] = [];
      visit(ast, (_node, _ancestors, info) => {
        depths.push(info.depth);
      });
      // Should start at 1 and increment as we go deeper
      expect(depths[0]).toBe(1); // root
      expect(Math.max(...depths)).toBeGreaterThanOrEqual(5);
    });
  });

  describe("starting from non-root nodes", () => {
    it("should work when starting from segment", () => {
      const segment = s("PID", f(c("value1")), f(c("value2")));
      const visitedTypes: string[] = [];
      visit(segment, (node) => {
        visitedTypes.push(node.type);
      });

      expect(visitedTypes).toStrictEqual([
        "segment",
        "field",
        "field-repetition",
        "component",
        "subcomponent",
        "field",
        "field-repetition",
        "component",
        "subcomponent",
      ]);
    });

    it("should work when starting from field", () => {
      const field = f(c("comp1"), c("comp2"));
      const visitedTypes: string[] = [];
      visit(field, (node) => {
        visitedTypes.push(node.type);
      });

      expect(visitedTypes).toStrictEqual([
        "field",
        "field-repetition",
        "component",
        "subcomponent",
        "component",
        "subcomponent",
      ]);
    });

    it("should have correct depth when starting from non-root", () => {
      const field = f(c("value"));
      visit(field, "component", (_node, ancestors, info) => {
        expect(ancestors).toHaveLength(2); // field > field-repetition
        expect(info.depth).toBe(3); // field=1, field-repetition=2, component=3
        expect(info.index).toBe(0);
        expect(info.sequence).toBe(1);
      });
    });
  });

  describe("metadata availability", () => {
    it("should not have metadata when not applicable", () => {
      const field = f(c("value"));
      visit(field, "field", (_node, _ancestors, info) => {
        expect(info.metadata).toBeUndefined();
      });
    });
  });

  describe("index and sequence tracking for siblings", () => {
    it("should correctly track field indices (0-based) and sequences (1-based)", () => {
      const segment = s("PID", f(c("field1")), f(c("field2")), f(c("field3")));
      const indices: number[] = [];
      const sequences: number[] = [];
      visit(segment, "field", (_node, _ancestors, info) => {
        indices.push(info.index);
        sequences.push(info.sequence);
      });
      // index is 0-based array position
      expect(indices).toStrictEqual([0, 1, 2]);
      // sequence is 1-based: fields get 1, 2, 3
      expect(sequences).toStrictEqual([1, 2, 3]);
    });

    it("should correctly track component indices and sequences", () => {
      const field = f(c("comp1"), c("comp2"), c("comp3"));
      const indices: number[] = [];
      const sequences: number[] = [];
      visit(field, "component", (_node, _ancestors, info) => {
        indices.push(info.index);
        sequences.push(info.sequence);
      });
      expect(indices).toStrictEqual([0, 1, 2]);
      expect(sequences).toStrictEqual([1, 2, 3]);
    });
  });

  describe("edge cases", () => {
    it("should handle empty children arrays gracefully", () => {
      const segment = s("NK1"); // Segment with no fields
      const visitedTypes: string[] = [];
      visit(segment, (node) => {
        visitedTypes.push(node.type);
      });

      expect(visitedTypes).toStrictEqual(["segment"]);
    });

    it("should handle nodes without children property", () => {
      const subcomponent = { type: "subcomponent", value: "test" } as const;
      const visitedTypes: string[] = [];
      visit(subcomponent, (node) => {
        visitedTypes.push(node.type);
      });

      expect(visitedTypes).toStrictEqual(["subcomponent"]);
    });

    it("should handle deeply nested structures", () => {
      const ast = m(g("GROUP1", g("GROUP2", s("PID", f(c("value"))))));

      let maxDepth = 0;
      visit(ast, (_node, _ancestors, info) => {
        if (info.depth > maxDepth) {
          maxDepth = info.depth;
        }
      });

      // Should track depth correctly even in deeply nested structure
      expect(maxDepth).toBeGreaterThanOrEqual(6);
    });

    it("should handle test object with explicit undefined value", () => {
      const ast = m(s("MSH", f(c())), g("PATIENT_GROUP", s("PID", f())));
      const visitedTypes: string[] = [];

      // Match nodes that don't have a specific property
      visit(ast, { name: undefined } as Partial<Segment>, (node) => {
        visitedTypes.push(node.type);
      });

      // Should match nodes that don't have a name property (e.g., root, field)
      expect(visitedTypes).toContain("root");
    });

    it("should handle empty root message", () => {
      const ast = m(); // Empty message
      const visitedTypes: string[] = [];
      visit(ast, (node) => {
        visitedTypes.push(node.type);
      });

      expect(visitedTypes).toStrictEqual(["root"]);
    });

    it("should handle multiple skip operations in same tree", () => {
      const ast = m(
        s("MSH", f(c()), f(c())),
        s("PID", f(c()), f(c())),
        s("NK1", f(c()), f(c()))
      );
      const visitedHeaders: string[] = [];

      visit(ast, (node) => {
        if (node.type === "segment") {
          visitedHeaders.push(node.name || "");

          // Skip MSH and NK1 children
          if (node.name === "MSH" || node.name === "NK1") {
            return SKIP;
          }
        }
      });

      // Should visit all segment headers but only PID children
      expect(visitedHeaders).toStrictEqual(["MSH", "PID", "NK1"]);
    });

    // Note: unist-util-visit-parents does not handle sparse children arrays.
    // The old custom implementation handled them, but we now delegate to the library.
    // This is considered acceptable as sparse arrays are unusual in well-formed ASTs.
  });

  describe("aPI Design: Test vs Visitor disambiguation", () => {
    it("should treat 2-arg function as visitor, not test", () => {
      const ast = m(s("MSH", f(c())), s("PID", f(c())));
      const visitedTypes: string[] = [];

      // Function as 2nd arg is always treated as Visitor
      visit(ast, (node) => {
        visitedTypes.push(node.type);
      });

      // Should visit ALL nodes (not filtering)
      expect(visitedTypes).toContain("root");
      expect(visitedTypes).toContain("segment");
      expect(visitedTypes).toContain("field");
    });

    it("should require explicit 3-arg form for test functions", () => {
      const ast = m(s("MSH", f(c())), s("PID", f(c())));
      const visitedTypes: string[] = [];

      // Correct way: explicit 3-arg form with test function
      visit(
        ast,
        (node) => node.type === "segment",
        (node) => {
          visitedTypes.push(node.type);
        }
      );

      // Should only visit segments (filtering applied)
      expect(visitedTypes).toStrictEqual(["segment", "segment"]);
      expect(visitedTypes).not.toContain("root");
      expect(visitedTypes).not.toContain("field");
    });
  });

  describe("security: Prototype pollution protection", () => {
    it("should ignore __proto__ in test object", () => {
      const ast = m(s("MSH", f(c()), f()));
      const visitedNodes: string[] = [];

      visit(
        ast,
        { __proto__: "malicious", type: "segment" } as Partial<Segment>,
        (node) => {
          visitedNodes.push(node.type);
        }
      );

      // Should match segments normally, ignoring __proto__
      expect(visitedNodes).toStrictEqual(["segment"]);
    });

    it("should ignore constructor in test object", () => {
      const ast = m(s("MSH", f(c()), f()));
      const visitedNodes: string[] = [];

      visit(
        ast,
        {
          constructor: "malicious",
          type: "field",
        } as unknown as Partial<Segment>,
        (node) => {
          visitedNodes.push(node.type);
        }
      );

      // Should match fields normally, ignoring constructor
      expect(visitedNodes).toStrictEqual(["field", "field"]);
    });

    it("should ignore prototype in test object", () => {
      const ast = m(s("MSH", f(c()), f()));
      const visitedNodes: string[] = [];

      visit(
        ast,
        {
          prototype: "malicious",
          type: "component",
        } as unknown as Partial<Segment>,
        (node) => {
          visitedNodes.push(node.type);
        }
      );

      // Should match components normally, ignoring prototype
      expect(visitedNodes).toStrictEqual(["component"]);
    });
  });

  describe("integration tests", () => {
    it("should give fields 1-based sequence", () => {
      const ast = m(
        s(
          "MSH",
          f("1") // MSH.1
        )
      );

      let visited = false;
      visit(ast, "field", (_node, _ancestors, info) => {
        expect(info.index).toBe(0); // First field in children array
        expect(info.sequence).toBe(1); // 1-based sequence
        expect(info.depth).toBe(3); // root=1, segment=2, field=3
        visited = true;
      });

      expect(visited).toBeTruthy();
    });

    it("should track sequence correctly across filtered nodes", () => {
      const ast = m(
        s(
          "MSH",
          f(), // MSH.1 - empty
          f(), // MSH.2 - empty
          f("3"), // MSH.3 - has content
          f() // MSH.4 - empty
        )
      );

      let visited = false;
      visit(
        ast,
        // This test matches only non-empty fields
        (node) => node.type === "field" && node.children.length > 0,
        (_node, _ancestors, info) => {
          // Sequence reflects position in parent (1-based), not filtered position
          expect(info.sequence).toBe(3); // MSH.3
          expect(info.depth).toBe(3);
          expect(info.index).toBe(2);
          visited = true;
        }
      );

      expect(visited).toBeTruthy();
    });
  });
});
