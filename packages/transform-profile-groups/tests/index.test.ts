import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import type { Group, Root, Segment } from "@glion/ast";
import { parseHL7v2 } from "@glion/parser";
import type { EventSchema } from "@glion/profiles";
import { toHl7v2 } from "@glion/to-hl7v2";
import { selectAll, value } from "@glion/util-query";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import { hl7v2TransformProfileGroups } from "../src";
import type { TransformProfileGroupsContext } from "../src";

type Outline = string | [string, ...Outline[]];

const nodeOutline = (node: Group | Segment): Outline => {
  switch (node.type) {
    case "group": {
      return [node.name, ...node.children.map(nodeOutline)];
    }
    case "segment": {
      return node.name;
    }
  }
};

// The tree as segment names nested in group names.
const outline = (tree: Root): Outline[] =>
  (tree.children as (Group | Segment)[]).map(nodeOutline);

const message = (...lines: string[]) => lines.join("\r");

const ORU = message(
  "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG1|P|2.5",
  "PID|1||12345^^^MRN||Doe^John",
  "PV1|1|I",
  "ORC|RE|ORD1",
  "OBR|1|ORD1||CBC",
  "OBX|1|NM|WBC||5.0",
  "OBX|2|NM|RBC||4.1"
);

const grouped = async (text: string, file = new VFile()) => {
  const tree = parseHL7v2(text);
  await unified().use(hl7v2TransformProfileGroups).run(tree, file);
  return tree;
};

/** MSH, PID, then a VISIT group of PV1 and an optional ZPV. */
const SITE_SCHEMA: EventSchema = {
  elements: [
    { name: "MSH", optional: false, repeating: false, type: "segment" },
    { name: "PID", optional: false, repeating: false, type: "segment" },
    {
      elements: [
        { name: "PV1", optional: false, repeating: false, type: "segment" },
        { name: "ZPV", optional: true, repeating: false, type: "segment" },
      ],
      name: "VISIT",
      optional: false,
      repeating: false,
      type: "group",
    },
  ],
  id: "ZAD_Z01",
};

const SITE_MESSAGE = message(
  "MSH|^~\\&|APP|FAC|APP|FAC|20241201120000||ZAD^Z01^ZAD_Z01|MSG4|P|2.5",
  "PID|1||12345^^^MRN||Doe^John",
  "PV1|1|I",
  "ZPV|1|site"
);

describe("hl7v2TransformProfileGroups", () => {
  describe("grouping by the schema MSH-9 names", () => {
    it("nests segments in the groups their event schema defines", async () => {
      expect(outline(await grouped(ORU))).toEqual([
        "MSH",
        [
          "PATIENT_RESULT",
          ["PATIENT", "PID", ["VISIT", "PV1"]],
          [
            "ORDER_OBSERVATION",
            "ORC",
            "OBR",
            ["OBSERVATION", "OBX"],
            ["OBSERVATION", "OBX"],
          ],
        ],
      ]);
    });

    it("starts a new order in the current patient result for an ORC after an OBX", async () => {
      const tree = await grouped(
        message(
          "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG5|P|2.5",
          "PID|1||12345^^^MRN||Doe^John",
          "ORC|RE|ORD1",
          "OBR|1|ORD1||CBC",
          "OBX|1|NM|WBC||5.0",
          "ORC|RE|ORD2",
          "OBR|2|ORD2||BMP",
          "OBX|1|NM|NA||140"
        )
      );

      expect(outline(tree)).toEqual([
        "MSH",
        [
          "PATIENT_RESULT",
          ["PATIENT", "PID"],
          ["ORDER_OBSERVATION", "ORC", "OBR", ["OBSERVATION", "OBX"]],
          ["ORDER_OBSERVATION", "ORC", "OBR", ["OBSERVATION", "OBX"]],
        ],
      ]);
    });

    it("starts a new patient result for a PID after an order", async () => {
      const tree = await grouped(
        message(
          "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG6|P|2.5",
          "PID|1||111^^^MRN||Doe^John",
          "OBR|1|ORD1||CBC",
          "PID|2||222^^^MRN||Roe^Jane",
          "OBR|1|ORD2||CBC"
        )
      );

      expect(outline(tree)).toEqual([
        "MSH",
        ["PATIENT_RESULT", ["PATIENT", "PID"], ["ORDER_OBSERVATION", "OBR"]],
        ["PATIENT_RESULT", ["PATIENT", "PID"], ["ORDER_OBSERVATION", "OBR"]],
      ]);
    });

    it("attaches each NTE to the patient, order, or result it follows", async () => {
      const tree = await grouped(
        message(
          "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG8|P|2.5",
          "PID|1||12345^^^MRN||Doe^John",
          "NTE|1||Patient comment",
          "OBR|1|ORD1||CBC",
          "NTE|1||Order comment",
          "OBX|1|NM|WBC||5.0",
          "NTE|1||Result comment",
          "NTE|2||Second result comment"
        )
      );

      expect(outline(tree)).toEqual([
        "MSH",
        [
          "PATIENT_RESULT",
          ["PATIENT", "PID", "NTE"],
          [
            "ORDER_OBSERVATION",
            "OBR",
            "NTE",
            ["OBSERVATION", "OBX", "NTE", "NTE"],
          ],
        ],
      ]);
    });

    it("groups a result message without a patient", async () => {
      const tree = await grouped(
        message(
          "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG9|P|2.5",
          "OBR|1|ORD1||CBC",
          "OBX|1|NM|WBC||5.0"
        )
      );

      expect(outline(tree)).toEqual([
        "MSH",
        [
          "PATIENT_RESULT",
          ["ORDER_OBSERVATION", "OBR", ["OBSERVATION", "OBX"]],
        ],
      ]);
    });

    it("keeps a specimen's OBX in the specimen and a closing DSC at the top level", async () => {
      const tree = await grouped(
        message(
          "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG10|P|2.5",
          "PID|1||12345^^^MRN||Doe^John",
          "OBR|1|ORD1||CBC",
          "OBX|1|NM|WBC||5.0",
          "SPM|1|SPEC1",
          "OBX|1|ST|SPECQUAL||Adequate",
          "DSC|PTR1"
        )
      );

      expect(outline(tree)).toEqual([
        "MSH",
        [
          "PATIENT_RESULT",
          ["PATIENT", "PID"],
          [
            "ORDER_OBSERVATION",
            "OBR",
            ["OBSERVATION", "OBX"],
            ["SPECIMEN", "SPM", "OBX"],
          ],
        ],
        "DSC",
      ]);
    });

    it("places the chosen alternative of a choice in the enclosing group", async () => {
      const tree = await grouped(
        message(
          "MSH|^~\\&|PHM|FAC|EMR|RFAC|20241201120000||ORM^O01^ORM_O01|MSG2|P|2.5",
          "PID|1||12345^^^MRN||Doe^John",
          "ORC|NW|ORD2",
          "RXO|RX123^Amoxicillin"
        )
      );

      expect(outline(tree)).toEqual([
        "MSH",
        ["PATIENT", "PID"],
        ["ORDER", "ORC", ["ORDER_DETAIL", "RXO"]],
      ]);
    });

    it("groups by the schema the event map names when MSH-9.3 is empty", async () => {
      const tree = await grouped(
        message(
          "MSH|^~\\&|ADT|FAC|EMR|RFAC|20241201120000||ADT^A04|MSG7|P|2.5",
          "EVN|A04|20241201120000",
          "PID|1||12345^^^MRN||Doe^John",
          "PV1|1|O",
          "IN1|1|PLAN1",
          "IN2|1|SSN1",
          "IN1|2|PLAN2"
        )
      );

      expect(outline(tree)).toEqual([
        "MSH",
        "EVN",
        "PID",
        "PV1",
        ["INSURANCE", "IN1", "IN2"],
        ["INSURANCE", "IN1"],
      ]);
    });
  });

  describe("the grouped tree", () => {
    it("holds the same segment nodes, in the same order", async () => {
      const tree = parseHL7v2(ORU);
      const before = [...tree.children];

      await unified().use(hl7v2TransformProfileGroups).run(tree, new VFile());

      const after: Segment[] = [];
      const collect = (nodes: readonly (Group | Segment)[]) => {
        for (const node of nodes) {
          if (node.type === "group") {
            collect(node.children);
          } else {
            after.push(node);
          }
        }
      };
      collect(tree.children as (Group | Segment)[]);

      expect(after).toHaveLength(before.length);
      for (const [index, node] of after.entries()) {
        expect(node).toBe(before[index]);
      }
    });

    it("spans each group from the start of its first segment to the end of its last", async () => {
      const tree = await grouped(ORU);
      const [, result] = tree.children as [Segment, Group];
      const [patient, order] = result.children as [Group, Group];
      const pid = patient.children[0] as Segment;
      const obx = (order.children.at(-1) as Group).children[0] as Segment;

      expect(result.position).toEqual({
        end: obx.position?.end,
        start: pid.position?.start,
      });
    });

    it("serializes to the same text as the flat tree", async () => {
      expect(toHl7v2(await grouped(ORU))).toBe(toHl7v2(parseHL7v2(ORU)));
    });

    it("resolves the same segment paths as the flat tree", async () => {
      const tree: Root = await grouped(ORU);

      expect(value(tree, "PID-3.1")?.value).toBe("12345");
      expect(value(tree, "OBX[2]-5")?.value).toBe("4.1");
    });

    it("addresses each order's results through its group", async () => {
      const tree = await grouped(
        message(
          "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG5|P|2.5",
          "PID|1||12345^^^MRN||Doe^John",
          "OBR|1|ORD1||CBC",
          "OBX|1|NM|WBC||5.0",
          "OBX|2|NM|RBC||4.1",
          "OBR|2|ORD2||BMP",
          "OBX|1|NM|NA||140"
        )
      );

      expect(selectAll(tree, "PATIENT_RESULT-ORDER_OBSERVATION")).toHaveLength(
        2
      );
      expect(
        value(tree, "PATIENT_RESULT-ORDER_OBSERVATION[2]-OBX-5")?.value
      ).toBe("140");
    });

    it("addresses a result of the first order by its group and position", async () => {
      const tree = await grouped(ORU);

      expect(
        value(tree, "PATIENT_RESULT-ORDER_OBSERVATION[1]-OBX[2]-5")?.value
      ).toBe("4.1");
    });

    it("lets profile annotation run after grouping", async () => {
      const tree = parseHL7v2(ORU);

      await unified()
        .use(hl7v2TransformProfileGroups)
        .use(hl7v2AnnotateProfileContext)
        .use(hl7v2AnnotateProfileFields)
        .run(tree, new VFile());

      const result = tree.children[1] as Group;
      const pid = (result.children[0] as Group).children[0] as Segment;
      expect(pid.children[2]?.data?.name).toBe("Patient Identifier List");
    });
  });

  describe("Z-segments", () => {
    it("places each Z-segment right after the segment before it, in that segment's group", async () => {
      const tree = await grouped(
        message(
          "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG11|P|2.5",
          "PID|1||12345^^^MRN||Doe^John",
          "ZPI|1|site patient",
          "OBR|1|ORD1||CBC",
          "ZDS|1|site order",
          "OBX|1|NM|WBC||5.0",
          "ZRS|1|site result"
        )
      );

      expect(outline(tree)).toEqual([
        "MSH",
        [
          "PATIENT_RESULT",
          ["PATIENT", "PID", "ZPI"],
          ["ORDER_OBSERVATION", "OBR", "ZDS", ["OBSERVATION", "OBX", "ZRS"]],
        ],
      ]);
    });

    it("keeps consecutive Z-segments together, in order", async () => {
      const tree = await grouped(
        message(
          "MSH|^~\\&|ADT|FAC|EMR|RFAC|20241201120000||ADT^A01^ADT_A01|MSG12|P|2.5",
          "ZAA|1",
          "ZAB|1",
          "EVN|A01|20241201120000",
          "PID|1||12345^^^MRN||Doe^John",
          "PV1|1|I",
          "IN1|1|PLAN1",
          "ZIN|1",
          "ZIO|1"
        )
      );

      expect(outline(tree)).toEqual([
        "MSH",
        "ZAA",
        "ZAB",
        "EVN",
        "PID",
        "PV1",
        ["INSURANCE", "IN1", "ZIN", "ZIO"],
      ]);
    });

    it("extends a group's position over the Z-segment it ends with", async () => {
      const tree = await grouped(`${ORU}\rZXY|1|site-specific`);
      const zxy = (
        ((tree.children[1] as Group).children[1] as Group).children.at(
          -1
        ) as Group
      ).children.at(-1) as Segment;

      expect(zxy.name).toBe("ZXY");
      expect((tree.children[1] as Group).position?.end).toEqual(
        zxy.position?.end
      );
    });

    it("serializes to the same text as the flat tree", async () => {
      const text = `${ORU}\rZXY|1|site-specific`;

      expect(toHl7v2(await grouped(text))).toBe(toHl7v2(parseHL7v2(text)));
    });

    it("places a Z-segment the caller's schema names where the schema puts it", async () => {
      const tree = parseHL7v2(SITE_MESSAGE);

      await unified()
        .use(hl7v2TransformProfileGroups, { definition: SITE_SCHEMA })
        .run(tree, new VFile());

      expect(outline(tree)).toEqual(["MSH", "PID", ["VISIT", "PV1", "ZPV"]]);
    });

    it("keeps a Z-segment the schema names in its place beside one it does not", async () => {
      const definition: EventSchema = {
        elements: [
          { name: "MSH", optional: false, repeating: false, type: "segment" },
          { name: "PID", optional: false, repeating: false, type: "segment" },
          {
            elements: [
              {
                name: "ZPV",
                optional: true,
                repeating: false,
                type: "segment",
              },
              {
                name: "PV1",
                optional: false,
                repeating: false,
                type: "segment",
              },
            ],
            name: "VISIT",
            optional: false,
            repeating: false,
            type: "group",
          },
        ],
        id: "ZAD_Z01",
      };
      const placed = parseHL7v2(
        message(
          "MSH|^~\\&|APP|FAC|APP|FAC|20241201120000||ZAD^Z01^ZAD_Z01|MSG13|P|2.5",
          "PID|1||12345^^^MRN",
          "ZPV|1|site visit",
          "PV1|1|I",
          "ZXX|1|unknown"
        )
      );
      const misplaced = parseHL7v2(
        message(
          "MSH|^~\\&|APP|FAC|APP|FAC|20241201120000||ZAD^Z01^ZAD_Z01|MSG14|P|2.5",
          "PID|1||12345^^^MRN",
          "PV1|1|I",
          "ZPV|1|site visit",
          "ZXX|1|unknown"
        )
      );

      for (const tree of [placed, misplaced]) {
        await unified()
          .use(hl7v2TransformProfileGroups, { definition })
          .run(tree, new VFile());
      }

      expect(outline(placed)).toEqual([
        "MSH",
        "PID",
        ["VISIT", "ZPV", "PV1", "ZXX"],
      ]);
      expect(outline(misplaced)).toEqual(["MSH", "PID", "PV1", "ZPV", "ZXX"]);
    });

    it("keeps Z-segments before the first segment the schema defines at the top level", async () => {
      const tree = parseHL7v2(message("ZAA|1", "PID|1||12345^^^MRN"));
      const definition: EventSchema = {
        elements: [
          {
            elements: [
              {
                name: "PID",
                optional: false,
                repeating: false,
                type: "segment",
              },
            ],
            name: "PATIENT",
            optional: false,
            repeating: false,
            type: "group",
          },
        ],
        id: "ZPT_Z01",
      };

      await unified()
        .use(hl7v2TransformProfileGroups, { definition })
        .run(tree, new VFile());

      expect(outline(tree)).toEqual(["ZAA", ["PATIENT", "PID"]]);
    });

    it("leaves the tree flat for a Z-segment the schema does not name when allowZSegments is false", async () => {
      const tree = parseHL7v2(`${ORU}\rZXY|1|site-specific`);

      await unified()
        .use(hl7v2TransformProfileGroups, { allowZSegments: false })
        .run(tree, new VFile());

      expect(outline(tree)).toEqual([
        "MSH",
        "PID",
        "PV1",
        "ORC",
        "OBR",
        "OBX",
        "OBX",
        "ZXY",
      ]);
    });

    it("places a Z-segment the schema names when allowZSegments is false", async () => {
      const tree = parseHL7v2(SITE_MESSAGE);

      await unified()
        .use(hl7v2TransformProfileGroups, {
          allowZSegments: false,
          definition: SITE_SCHEMA,
        })
        .run(tree, new VFile());

      expect(outline(tree)).toEqual(["MSH", "PID", ["VISIT", "PV1", "ZPV"]]);
    });
  });

  describe("messages it leaves unchanged", () => {
    it("leaves the tree flat when a segment is out of order", async () => {
      const tree = await grouped(
        message(
          "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG3|P|2.5",
          "PID|1||12345^^^MRN||Doe^John",
          "OBX|1|NM|WBC||5.0"
        )
      );

      expect(outline(tree)).toEqual(["MSH", "PID", "OBX"]);
    });

    it("leaves the tree flat when a required segment is missing at the end", async () => {
      const tree = await grouped(
        message(
          "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG3|P|2.5",
          "PID|1||12345^^^MRN||Doe^John"
        )
      );

      expect(outline(tree)).toEqual(["MSH", "PID"]);
    });

    it("leaves the tree flat when it holds a segment the schema does not define that is not a Z-segment", async () => {
      const tree = await grouped(`${ORU}\rQXY|1|unknown`);

      expect(outline(tree)).toEqual([
        "MSH",
        "PID",
        "PV1",
        "ORC",
        "OBR",
        "OBX",
        "OBX",
        "QXY",
      ]);
    });

    it("leaves the tree flat when a segment is out of order beside a Z-segment", async () => {
      const tree = await grouped(
        message(
          "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG3|P|2.5",
          "PID|1||12345^^^MRN||Doe^John",
          "ZPI|1|site",
          "OBX|1|NM|WBC||5.0"
        )
      );

      expect(outline(tree)).toEqual(["MSH", "PID", "ZPI", "OBX"]);
    });

    it("leaves the tree flat without MSH-12", async () => {
      const tree = await grouped(
        message(
          "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG1|P",
          "PID|1||12345^^^MRN||Doe^John"
        )
      );

      expect(outline(tree)).toEqual(["MSH", "PID"]);
    });

    it("leaves the tree flat when the version bundles no such event", async () => {
      expect(outline(await grouped(SITE_MESSAGE))).toEqual([
        "MSH",
        "PID",
        "PV1",
        "ZPV",
      ]);
    });

    it("leaves a tree without segments empty", async () => {
      const tree: Root = { children: [], type: "root" };

      await unified()
        .use(hl7v2TransformProfileGroups, { definition: SITE_SCHEMA })
        .run(tree, new VFile());

      expect(tree.children).toEqual([]);
    });

    it("leaves a tree grouped by another plugin as it is, even when its segments fit the schema", async () => {
      const [msh, pid, pv1, zpv] = parseHL7v2(SITE_MESSAGE)
        .children as Segment[];
      const visit: Group = {
        children: [pv1 as Segment],
        name: "VISIT",
        type: "group",
      };
      const tree: Root = {
        children: [msh as Segment, pid as Segment, visit, zpv as Segment],
        type: "root",
      };

      await unified()
        .use(hl7v2TransformProfileGroups, { definition: SITE_SCHEMA })
        .run(tree, new VFile());

      expect(outline(tree)).toEqual(["MSH", "PID", ["VISIT", "PV1"], "ZPV"]);
      expect(tree.children[2]).toBe(visit);
    });

    it("does not call the definition function for a tree that already holds groups", async () => {
      const tree = await grouped(ORU);
      const calls: TransformProfileGroupsContext[] = [];

      await unified()
        .use(hl7v2TransformProfileGroups, {
          definition: (context) => {
            calls.push(context);
            return SITE_SCHEMA;
          },
        })
        .run(tree, new VFile());

      expect(calls).toEqual([]);
    });

    it("leaves a tree that already holds groups as it is", async () => {
      const tree = await grouped(ORU);
      const children = [...tree.children];

      await unified().use(hl7v2TransformProfileGroups).run(tree, new VFile());

      expect(tree.children).toEqual(children);
      for (const [index, node] of tree.children.entries()) {
        expect(node).toBe(children[index]);
      }
    });
  });

  describe("options.definition", () => {
    it("groups by an event schema of the caller's own", async () => {
      const tree = parseHL7v2(SITE_MESSAGE);

      await unified()
        .use(hl7v2TransformProfileGroups, { definition: SITE_SCHEMA })
        .run(tree, new VFile());

      expect(outline(tree)).toEqual(["MSH", "PID", ["VISIT", "PV1", "ZPV"]]);
    });

    it("groups by the schema a function chooses for the message", async () => {
      const tree = parseHL7v2(SITE_MESSAGE);
      const file = new VFile();
      const contexts: TransformProfileGroupsContext[] = [];

      await unified()
        .use(hl7v2TransformProfileGroups, {
          definition: (context) => {
            contexts.push(context);
            return SITE_SCHEMA;
          },
        })
        .run(tree, file);

      expect(outline(tree)).toEqual(["MSH", "PID", ["VISIT", "PV1", "ZPV"]]);
      expect(contexts).toHaveLength(1);
      expect(contexts[0]?.tree).toBe(tree);
      expect(contexts[0]?.file).toBe(file);
    });

    it("groups by the schema an async function resolves", async () => {
      const tree = parseHL7v2(SITE_MESSAGE);

      await unified()
        .use(hl7v2TransformProfileGroups, {
          definition: async () => await Promise.resolve(SITE_SCHEMA),
        })
        .run(tree, new VFile());

      expect(outline(tree)).toEqual(["MSH", "PID", ["VISIT", "PV1", "ZPV"]]);
    });

    it("groups by the schema MSH-9 names when the function returns undefined", async () => {
      const tree = parseHL7v2(ORU);

      await unified()
        .use(hl7v2TransformProfileGroups, { definition: () => {} })
        .run(tree, new VFile());

      expect(outline(tree)).toEqual(outline(await grouped(ORU)));
    });

    it("rejects with the schema's ID when the schema is invalid", async () => {
      const tree = parseHL7v2(SITE_MESSAGE);
      const definition: EventSchema = { elements: [], id: "ZAD_Z01" };

      await expect(
        unified()
          .use(hl7v2TransformProfileGroups, { definition })
          .run(tree, new VFile())
      ).rejects.toThrow("Invalid event schema ZAD_Z01");
    });

    it("rejects when a choice alternative can match no segment", async () => {
      const tree = parseHL7v2(SITE_MESSAGE);
      const definition: EventSchema = {
        elements: [
          { name: "MSH", optional: false, repeating: false, type: "segment" },
          {
            alternatives: [
              {
                name: "PID",
                optional: true,
                repeating: false,
                type: "segment",
              },
              {
                name: "PV1",
                optional: false,
                repeating: false,
                type: "segment",
              },
            ],
            optional: false,
            repeating: false,
            type: "choice",
          },
        ],
        id: "ZAD_Z01",
      };

      await expect(
        unified()
          .use(hl7v2TransformProfileGroups, { definition })
          .run(tree, new VFile())
      ).rejects.toThrow("a choice alternative can match no segment");
    });

    it("rejects with the error the definition function throws", async () => {
      const tree = parseHL7v2(SITE_MESSAGE);
      const error = new Error("no schema for this site");

      await expect(
        unified()
          .use(hl7v2TransformProfileGroups, {
            definition: () => {
              throw error;
            },
          })
          .run(tree, new VFile())
      ).rejects.toBe(error);
    });
  });
});
