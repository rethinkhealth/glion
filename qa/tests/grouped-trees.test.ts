/**
 * QR6: Grouped trees — every plugin reads a grouped tree as it reads the flat
 * one.
 *
 * `@glion/transform-profile-groups` nests segments in `Group` nodes. The
 * lint rules, the profile annotators, and the serializer read segments at
 * any depth, so on the same message they must report the same diagnostics,
 * set the same annotations, and write the same text whether the tree is
 * grouped or not.
 *
 * Checked on the fixtures the transform groups, and on generated messages
 * that fit the bundled v2.5 event schemas, whose segments carry only a Set ID
 * so the field and component rules report inside the groups.
 */
import { hl7v2AnnotateDelimiters } from "@glion/annotate-delimiters";
import type { Group, Nodes, Root, Segment } from "@glion/ast";
import { hl7v2DecodeEscapes } from "@glion/decode-escapes";
import { parseHL7v2 } from "@glion/parser";
import hl7v2PresetAnnotateProfileRecommended from "@glion/preset-annotate-profile-recommended";
import hl7v2PresetLintProfileRecommended from "@glion/preset-lint-profile-recommended";
import hl7v2PresetLintRecommended from "@glion/preset-lint-recommended";
import type { EventSchema, EventSchemaElement } from "@glion/profiles";
import { profiles, runner } from "@glion/profiles";
import { toHl7v2 } from "@glion/to-hl7v2";
import { hl7v2TransformProfileGroups } from "@glion/transform-profile-groups";
import { visit } from "@glion/util-visit";
import fc from "fast-check";
import { unified } from "unified";
import { VFile } from "vfile";

import { arbEventSchemaMessage } from "../src/arbitraries";
import { discoverFixtures, readFixture } from "../src/fixtures";

const VERSION = "2.5";

const lint = unified()
  .use(hl7v2AnnotateDelimiters)
  .use(hl7v2DecodeEscapes)
  .use(hl7v2PresetLintRecommended)
  .use(hl7v2PresetLintProfileRecommended)
  .freeze();

const annotate = unified()
  .use(hl7v2AnnotateDelimiters)
  .use(hl7v2DecodeEscapes)
  .use(hl7v2PresetAnnotateProfileRecommended)
  .freeze();

const group = async (tree: Root): Promise<Root> => {
  await unified().use(hl7v2TransformProfileGroups).run(tree, new VFile());
  return tree;
};

const isGrouped = (tree: Root): boolean =>
  tree.children.some((child) => child.type === "group");

// What a diagnostic says and where, without the ancestors that name the
// groups.
const diagnostics = async (tree: Root) => {
  const file = new VFile();
  await lint.run(tree, file);
  return file.messages.map(({ column, line, reason, ruleId }) => ({
    column,
    line,
    reason,
    ruleId,
  }));
};

const annotatedSegments = async (tree: Root): Promise<Segment[]> => {
  await annotate.run(tree, new VFile());
  const segments: Segment[] = [];
  visit(tree, "segment", (node) => {
    segments.push(node);
  });
  return segments;
};

type Outline = string | [string, ...Outline[]];

const outline = (node: Group | Segment): Outline => {
  switch (node.type) {
    case "group": {
      return [node.id, ...node.children.map(outline)];
    }
    case "segment": {
      return node.name;
    }
  }
};

// Every event schema the version bundles, once each.
const eventMap = await profiles.eventMaps.load(VERSION);
const schemaIds = [...new Set(Object.values(eventMap ?? {}))].toSorted();
// Whether `elements` name Hxx, the segment that matches any segment.
const holdsAnySegment = (elements: readonly EventSchemaElement[]): boolean => {
  for (const element of elements) {
    switch (element.type) {
      case "segment": {
        if (element.name === "Hxx") {
          return true;
        }
        break;
      }
      case "group": {
        if (holdsAnySegment(element.elements)) {
          return true;
        }
        break;
      }
      case "choice": {
        if (holdsAnySegment(element.alternatives)) {
          return true;
        }
        break;
      }
    }
  }
  return false;
};

const schemas: EventSchema[] = [];
for (const id of schemaIds) {
  const schema = await profiles.events.load(VERSION, id);
  if (schema) {
    schemas.push(schema);
  }
}

const fixtures = discoverFixtures(() => true);
const groupedFixtures: string[] = [];
for (const filename of fixtures) {
  if (isGrouped(await group(parseHL7v2(readFixture(filename))))) {
    groupedFixtures.push(filename);
  }
}

describe("QR6: grouped trees", () => {
  it("groups the fixtures whose segments fit their event schema", async () => {
    const outlines: Record<string, Outline[]> = {};
    for (const filename of groupedFixtures) {
      const tree = await group(parseHL7v2(readFixture(filename)));
      outlines[filename] = (tree.children as (Group | Segment)[]).map(outline);
    }

    expect(outlines).toMatchInlineSnapshot(`
      {
        "adt-a01-full.hl7": [
          "MSH",
          "EVN",
          "PID",
          "PD1",
          "NK1",
          "PV1",
          "PV2",
          "DG1",
          [
            "INSURANCE",
            "IN1",
          ],
        ],
        "dft-p03-charge.hl7": [
          "MSH",
          "EVN",
          "PID",
          "PV1",
          [
            "FINANCIAL",
            "FT1",
          ],
        ],
        "mdm-t02-document.hl7": [
          "MSH",
          "EVN",
          "PID",
          "PV1",
          "TXA",
          [
            "OBSERVATION",
            "OBX",
          ],
        ],
        "orm-o01-order.hl7": [
          "MSH",
          [
            "PATIENT",
            "PID",
            [
              "PATIENT_VISIT",
              "PV1",
            ],
          ],
          [
            "ORDER",
            "ORC",
            [
              "ORDER_DETAIL",
              "OBR",
            ],
          ],
        ],
        "oru-r01-lab.hl7": [
          "MSH",
          [
            "PATIENT_RESULT",
            [
              "PATIENT",
              "PID",
            ],
            [
              "ORDER_OBSERVATION",
              "ORC",
              "OBR",
              [
                "OBSERVATION",
                "OBX",
              ],
              [
                "OBSERVATION",
                "OBX",
              ],
              [
                "OBSERVATION",
                "OBX",
              ],
              [
                "OBSERVATION",
                "OBX",
              ],
              [
                "OBSERVATION",
                "OBX",
              ],
            ],
          ],
        ],
      }
    `);
  });

  describe.each(groupedFixtures)("%s", (filename) => {
    const source = readFixture(filename);

    it("reports the same diagnostics grouped as flat", async () => {
      expect(await diagnostics(await group(parseHL7v2(source)))).toEqual(
        await diagnostics(parseHL7v2(source))
      );
    });

    it("sets the same annotations grouped as flat", async () => {
      expect(await annotatedSegments(await group(parseHL7v2(source)))).toEqual(
        await annotatedSegments(parseHL7v2(source))
      );
    });

    it("serializes to the same text grouped as flat", async () => {
      expect(toHl7v2(await group(parseHL7v2(source)))).toBe(
        toHl7v2(parseHL7v2(source))
      );
    });
  });

  describe(`generated messages that fit the v${VERSION} event schemas`, () => {
    const arbMessage = fc
      .constantFrom(...schemas)
      .chain((schema) =>
        arbEventSchemaMessage(schema, VERSION).map(
          (text) => [schema, text] as const
        )
      );

    it("fit the schema they were generated from, and are grouped by it", async () => {
      await fc.assert(
        fc.asyncProperty(arbMessage, async ([schema, text]) => {
          const ids = parseHL7v2(text).children.map(
            (child) => (child as Segment).name
          );
          const result = runner(schema, ids);
          expect(result.type).toBe("matched");
          const opensGroup =
            result.type === "matched" &&
            result.groups.some((match) => typeof match !== "number");
          expect(isGrouped(await group(parseHL7v2(text)))).toBe(opensGroup);
        }),
        { numRuns: 500 }
      );
    });

    it("report the same diagnostics grouped as flat", async () => {
      await fc.assert(
        fc.asyncProperty(arbMessage, async ([, text]) => {
          expect(await diagnostics(await group(parseHL7v2(text)))).toEqual(
            await diagnostics(parseHL7v2(text))
          );
        }),
        { numRuns: 200 }
      );
    });

    it("set the same annotations grouped as flat", async () => {
      await fc.assert(
        fc.asyncProperty(arbMessage, async ([, text]) => {
          expect(
            await annotatedSegments(await group(parseHL7v2(text)))
          ).toEqual(await annotatedSegments(parseHL7v2(text)));
        }),
        { numRuns: 200 }
      );
    });

    it("serialize to the same text grouped as flat", async () => {
      await fc.assert(
        fc.asyncProperty(arbMessage, async ([, text]) => {
          expect(toHl7v2(await group(parseHL7v2(text)))).toBe(text);
        }),
        { numRuns: 200 }
      );
    });
  });

  describe("generated messages with Z-segments", () => {
    // A message that fits a schema, and the same message with Z-segments
    // inserted after its MSH. A schema with an Hxx is left out: a reading
    // that reaches the Hxx takes the Z-segment there.
    const arbMessage = fc
      .constantFrom(
        ...schemas.filter((schema) => !holdsAnySegment(schema.elements))
      )
      .chain((schema) =>
        arbEventSchemaMessage(schema, VERSION).chain((base) => {
          const lines = base.split("\r");
          return fc
            .array(fc.integer({ max: lines.length, min: 1 }), {
              maxLength: 3,
              minLength: 1,
            })
            .map((positions) => {
              const withZ = [...lines];
              for (const position of positions.toSorted((a, b) => b - a)) {
                withZ.splice(position, 0, `ZXX|${position}`);
              }
              return { base, schema, text: withZ.join("\r") };
            });
        })
      );

    it("are grouped when the message without them opens a group", async () => {
      await fc.assert(
        fc.asyncProperty(arbMessage, async ({ base, schema, text }) => {
          const ids = parseHL7v2(base).children.map(
            (child) => (child as Segment).name
          );
          const result = runner(schema, ids);
          const opensGroup =
            result.type === "matched" &&
            result.groups.some((match) => typeof match !== "number");
          expect(isGrouped(await group(parseHL7v2(text)))).toBe(opensGroup);
        }),
        { numRuns: 200 }
      );
    });

    it("place each Z-segment beside the segment before it", async () => {
      await fc.assert(
        fc.asyncProperty(arbMessage, async ({ text }) => {
          const tree = await group(parseHL7v2(text));
          const placed: { name: string; parent: Nodes | undefined }[] = [];
          visit(tree, "segment", (node, ancestors) => {
            placed.push({ name: node.name, parent: ancestors.at(-1) });
          });
          for (const [index, { name, parent }] of placed.entries()) {
            if (name === "ZXX") {
              expect(parent).toBe(placed[index - 1]?.parent);
            }
          }
        }),
        { numRuns: 200 }
      );
    });

    it("keep every segment, in order, and their text", async () => {
      await fc.assert(
        fc.asyncProperty(arbMessage, async ({ text }) => {
          const tree = await group(parseHL7v2(text));
          const names: string[] = [];
          visit(tree, "segment", (node) => {
            names.push(node.name);
          });
          expect(names).toEqual(
            parseHL7v2(text).children.map((child) => (child as Segment).name)
          );
          expect(toHl7v2(tree)).toBe(text);
        }),
        { numRuns: 200 }
      );
    });

    it("report the same diagnostics grouped as flat", async () => {
      await fc.assert(
        fc.asyncProperty(arbMessage, async ({ text }) => {
          expect(await diagnostics(await group(parseHL7v2(text)))).toEqual(
            await diagnostics(parseHL7v2(text))
          );
        }),
        { numRuns: 200 }
      );
    });

    it("set the same annotations grouped as flat", async () => {
      await fc.assert(
        fc.asyncProperty(arbMessage, async ({ text }) => {
          expect(
            await annotatedSegments(await group(parseHL7v2(text)))
          ).toEqual(await annotatedSegments(parseHL7v2(text)));
        }),
        { numRuns: 200 }
      );
    });
  });
});
