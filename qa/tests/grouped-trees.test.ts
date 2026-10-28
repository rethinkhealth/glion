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

import {
  arbEventSchemaMessage,
  arbEventSchemaSegments,
  message,
} from "../src/arbitraries";
import { discoverFixtures, readFixture } from "../src/fixtures";

const VERSION = "2.5";

const lint = unified()
  .use(hl7v2AnnotateDelimiters)
  .use(hl7v2PresetLintRecommended)
  .use(hl7v2PresetLintProfileRecommended)
  .freeze();

const annotate = unified()
  .use(hl7v2AnnotateDelimiters)
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

// The shortest generated message that opens a group: BAR_P02 holds PID in a
// group.
const BAR_P02 = schemas.find(
  (schema) => schema.id === "BAR_P02"
) as EventSchema;
const BAR_P02_MESSAGE =
  "MSH|^~\\&|APP|FAC|APP|FAC|20240101120000||BAR^P02^BAR_P02|1|P|2.5\rEVN|1\rPID|1\r";

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

    // A generated message fits its schema, and the transform groups it exactly
    // when the schema's reading of it opens a group.
    //
    // Mutant: `@glion/transform-profile-groups` never replaces the root's children.
    // Fails on BAR_P02 and `"MSH|…|BAR^P02^BAR_P02|1|P|2.5\rEVN|1\rPID|1\r"`.
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
        { examples: [[[BAR_P02, BAR_P02_MESSAGE]]], numRuns: 500 }
      );
    });

    // The lint rules report the same findings, at the same places, on the
    // grouped tree as on the flat one.
    //
    // Mutant: `@glion/lint-profile-required-fields` reads no segment inside a group.
    // Fails on BAR_P02 and `"MSH|…|BAR^P02^BAR_P02|1|P|2.5\rEVN|1\rPID|1\r"`.
    it("report the same diagnostics grouped as flat", async () => {
      await fc.assert(
        fc.asyncProperty(arbMessage, async ([, text]) => {
          expect(await diagnostics(await group(parseHL7v2(text)))).toEqual(
            await diagnostics(parseHL7v2(text))
          );
        }),
        { examples: [[[BAR_P02, BAR_P02_MESSAGE]]], numRuns: 200 }
      );
    });

    // The profile annotators set the same data on every segment of the grouped
    // tree as on the flat one.
    //
    // Mutant: `@glion/annotate-profile-fields` reads no segment inside a group.
    // Fails on BAR_P02 and `"MSH|…|BAR^P02^BAR_P02|1|P|2.5\rEVN|1\rPID|1\r"`.
    it("set the same annotations grouped as flat", async () => {
      await fc.assert(
        fc.asyncProperty(arbMessage, async ([, text]) => {
          expect(
            await annotatedSegments(await group(parseHL7v2(text)))
          ).toEqual(await annotatedSegments(parseHL7v2(text)));
        }),
        { examples: [[[BAR_P02, BAR_P02_MESSAGE]]], numRuns: 200 }
      );
    });

    // The serializer writes the grouped tree as the message it was read from.
    //
    // Mutant: `@glion/to-hl7v2` writes no segment inside a group.
    // Fails on BAR_P02 and `"MSH|…|BAR^P02^BAR_P02|1|P|2.5\rEVN|1\rPID|1\r"`.
    it("serialize to the same text grouped as flat", async () => {
      await fc.assert(
        fc.asyncProperty(arbMessage, async ([, text]) => {
          expect(toHl7v2(await group(parseHL7v2(text)))).toBe(text);
        }),
        { examples: [[[BAR_P02, BAR_P02_MESSAGE]]], numRuns: 200 }
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
        arbEventSchemaSegments(schema, VERSION).chain((segments) =>
          fc
            .array(fc.integer({ max: segments.length, min: 1 }), {
              maxLength: 3,
              minLength: 1,
            })
            .map((positions) => {
              const withZ = [...segments];
              for (const position of positions.toSorted((a, b) => b - a)) {
                withZ.splice(position, 0, `ZXX|${position}`);
              }
              return {
                base: message(segments),
                schema,
                text: message(withZ),
              };
            })
        )
      );

    // A Z-segment the schema does not name changes nothing about whether the
    // message is grouped.
    //
    // Mutant: `@glion/transform-profile-groups` passes `allowZSegments: false` by default.
    // Fails on BAR_P02 and the same message with `ZXX|3` after PID.
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
        {
          examples: [
            [
              {
                base: BAR_P02_MESSAGE,
                schema: BAR_P02,
                text: `${BAR_P02_MESSAGE}ZXX|3\r`,
              },
            ],
          ],
          numRuns: 200,
        }
      );
    });

    // A Z-segment goes in the group of the segment before it.
    //
    // Mutant: `runner` places a Z-segment it passes over at the top of the message.
    // Fails on BAR_P02 and the same message with `ZXX|3` after PID.
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
        {
          examples: [
            [
              {
                base: BAR_P02_MESSAGE,
                schema: BAR_P02,
                text: `${BAR_P02_MESSAGE}ZXX|3\r`,
              },
            ],
          ],
          numRuns: 200,
        }
      );
    });

    // Grouping keeps every segment, Z-segments included, in order, and the
    // serializer writes the message as it was read.
    //
    // Mutant: `@glion/to-hl7v2` writes no segment inside a group.
    // Fails on BAR_P02 and the same message with `ZXX|3` after PID.
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
        {
          examples: [
            [
              {
                base: BAR_P02_MESSAGE,
                schema: BAR_P02,
                text: `${BAR_P02_MESSAGE}ZXX|3\r`,
              },
            ],
          ],
          numRuns: 200,
        }
      );
    });

    // The lint rules report the same findings with Z-segments in the groups.
    //
    // Mutant: `@glion/lint-profile-required-fields` reads no segment inside a group.
    // Fails on BAR_P02 and the same message with `ZXX|3` after PID.
    it("report the same diagnostics grouped as flat", async () => {
      await fc.assert(
        fc.asyncProperty(arbMessage, async ({ text }) => {
          expect(await diagnostics(await group(parseHL7v2(text)))).toEqual(
            await diagnostics(parseHL7v2(text))
          );
        }),
        {
          examples: [
            [
              {
                base: BAR_P02_MESSAGE,
                schema: BAR_P02,
                text: `${BAR_P02_MESSAGE}ZXX|3\r`,
              },
            ],
          ],
          numRuns: 200,
        }
      );
    });

    // The profile annotators set the same data with Z-segments in the groups.
    //
    // Mutant: `@glion/annotate-profile-fields` reads no segment inside a group.
    // Fails on BAR_P02 and the same message with `ZXX|3` after PID.
    it("set the same annotations grouped as flat", async () => {
      await fc.assert(
        fc.asyncProperty(arbMessage, async ({ text }) => {
          expect(
            await annotatedSegments(await group(parseHL7v2(text)))
          ).toEqual(await annotatedSegments(parseHL7v2(text)));
        }),
        {
          examples: [
            [
              {
                base: BAR_P02_MESSAGE,
                schema: BAR_P02,
                text: `${BAR_P02_MESSAGE}ZXX|3\r`,
              },
            ],
          ],
          numRuns: 200,
        }
      );
    });
  });
});
