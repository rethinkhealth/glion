import type { Random } from "../../scripts/check-bundle.mjs";
import {
  nearMiss,
  referenceMatch,
  seeded,
  validMessage,
} from "../../scripts/check-bundle.mjs";
import { runner } from "../../src/engine/runner";
import type { EventSchema, EventSchemaElement } from "../../src/engine/types";

const STRUCTURES = 3000;
// Each message runs twice, with Z-segments allowed and not.
const Z_STRUCTURES = STRUCTURES / 2;
const MESSAGES_PER_STRUCTURE = 12;
const NAMES = ["A", "B", "C"];
// A Z-segment schemas may name, and one they never do.
const NAMED_Z_SEGMENT = "ZA";
const UNNAMED_Z_SEGMENT = "ZQ";
const MAX_DEPTH = 3;
const MAX_WIDTH = 3;

const pick = <T>(items: readonly T[], random: Random): T =>
  items[Math.floor(random() * items.length)] as T;

const occurrence = (random: Random) => ({
  optional: random() < 0.5,
  repeating: random() < 0.4,
});

function element(
  depth: number,
  random: Random,
  names: readonly string[] = NAMES
): EventSchemaElement {
  const roll = random();
  if (depth >= MAX_DEPTH || roll < 0.5) {
    return {
      ...occurrence(random),
      name: pick(names, random),
      type: "segment",
    };
  }
  const children = elements(depth + 1, random, names);
  if (roll < 0.8) {
    const id = `G${depth}${Math.floor(random() * 10)}`;
    return {
      ...occurrence(random),
      elements: children,
      id,
      name: id,
      type: "group",
    };
  }
  return { ...occurrence(random), alternatives: children, type: "choice" };
}

function elements(
  depth: number,
  random: Random,
  names: readonly string[] = NAMES
): EventSchemaElement[] {
  const width = 1 + Math.floor(random() * MAX_WIDTH);
  return Array.from({ length: width }, () => element(depth, random, names));
}

const matchesNothing = (item: EventSchemaElement): boolean =>
  item.optional ||
  (item.type === "group" && item.elements.every(matchesNothing)) ||
  (item.type === "choice" && item.alternatives.some(matchesNothing));

const hasEmptyAlternative = (items: readonly EventSchemaElement[]): boolean =>
  items.some(
    (item) =>
      (item.type === "choice" &&
        (item.alternatives.some(matchesNothing) ||
          hasEmptyAlternative(item.alternatives))) ||
      (item.type === "group" && hasEmptyAlternative(item.elements))
  );

// Thousands of schemas each: well under a second locally, and up to ten times
// slower on CI under coverage.
const SWEEP_TIMEOUT_MS = 60_000;

describe("runner on random schemas", { timeout: SWEEP_TIMEOUT_MS }, () => {
  it("agrees with the reference parser on nested, nullable, and ambiguous schemas", () => {
    const random = seeded(20_260_919);
    const disagreements: string[] = [];
    let compared = 0;

    for (let s = 0; s < STRUCTURES; s += 1) {
      const schema: EventSchema = {
        elements: [
          { name: "MSH", optional: false, repeating: false, type: "segment" },
          ...elements(0, random),
        ],
        id: `R${s}`,
      };
      if (hasEmptyAlternative(schema.elements)) {
        continue;
      }
      compared += 1;

      for (let n = 0; n < MESSAGES_PER_STRUCTURE; n += 1) {
        const valid = validMessage(schema, random).slice(0, 14);
        for (const input of [valid, nearMiss(valid, NAMES, random)]) {
          const result = runner(schema, input);
          const got = JSON.stringify(
            result.type === "matched" ? result.groups : undefined
          );
          const want = JSON.stringify(referenceMatch(schema, input));
          if (got !== want && disagreements.length < 5) {
            disagreements.push(
              `${JSON.stringify(schema.elements)} on ${input.join(" ")}: vm ${got} ref ${want}`
            );
          }
        }
      }
    }

    expect(compared).toBeGreaterThan(STRUCTURES / 3);
    expect(disagreements).toEqual([]);
  });

  it("agrees with the reference parser on Z-segments the schema does not name, allowed or not", () => {
    const random = seeded(20_261_006);
    // Hxx about one segment in twelve: a schema of mostly Hxx is ambiguous
    // at every segment, which the backtracking reference pays for, and the
    // bundled schemas hold at most one.
    const names = [
      ...NAMES,
      ...NAMES,
      ...NAMES,
      NAMED_Z_SEGMENT,
      NAMED_Z_SEGMENT,
      "Hxx",
      "anyZSegment",
    ];
    const disagreements: string[] = [];
    let compared = 0;
    let matchedWithZ = 0;

    for (let s = 0; s < Z_STRUCTURES; s += 1) {
      const schema: EventSchema = {
        elements: [
          { name: "MSH", optional: false, repeating: false, type: "segment" },
          ...elements(0, random, names),
        ],
        id: `Z${s}`,
      };
      if (hasEmptyAlternative(schema.elements)) {
        continue;
      }
      compared += 1;

      for (let n = 0; n < MESSAGES_PER_STRUCTURE; n += 1) {
        const input = validMessage(schema, random).slice(0, 14);
        // Up to three runs of one to three Z-segments.
        for (let run = Math.floor(random() * 4); run > 0; run -= 1) {
          const at = Math.floor(random() * (input.length + 1));
          const length = 1 + Math.floor(random() * 3);
          input.splice(
            at,
            0,
            ...Array.from({ length }, () => UNNAMED_Z_SEGMENT)
          );
        }
        for (const allowZSegments of [true, false]) {
          const result = runner(schema, input, { allowZSegments });
          if (
            allowZSegments &&
            result.type === "matched" &&
            input.includes(UNNAMED_Z_SEGMENT)
          ) {
            matchedWithZ += 1;
          }
          const got = JSON.stringify(
            result.type === "matched" ? result.groups : undefined
          );
          const want = JSON.stringify(
            referenceMatch(schema, input, { allowZSegments })
          );
          if (got !== want && disagreements.length < 5) {
            disagreements.push(
              `${JSON.stringify(schema.elements)} on ${input.join(" ")} (allowZSegments ${allowZSegments}): vm ${got} ref ${want}`
            );
          }
        }
      }
    }

    expect(matchedWithZ).toBeGreaterThan(compared);
    expect(compared).toBeGreaterThan(Z_STRUCTURES / 3);
    expect(disagreements).toEqual([]);
  });
});
