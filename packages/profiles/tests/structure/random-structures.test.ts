import type { Random } from "../../scripts/check-bundle.mjs";
import {
  nearMiss,
  referenceMatch,
  seeded,
  validMessage,
} from "../../scripts/check-bundle.mjs";
import { matchStructure } from "../../src/structure/match";
import type {
  MessageStructure,
  StructureElement,
} from "../../src/structure/types";

const STRUCTURES = 3000;
const MESSAGES_PER_STRUCTURE = 12;
const NAMES = ["A", "B", "C"];
const MAX_DEPTH = 3;
const MAX_WIDTH = 3;

const pick = <T>(items: readonly T[], random: Random): T =>
  items[Math.floor(random() * items.length)] as T;

const occurrence = (random: Random) => ({
  optional: random() < 0.5,
  repeating: random() < 0.4,
});

function element(depth: number, random: Random): StructureElement {
  const roll = random();
  if (depth >= MAX_DEPTH || roll < 0.5) {
    return {
      ...occurrence(random),
      name: pick(NAMES, random),
      type: "segment",
    };
  }
  const children = elements(depth + 1, random);
  if (roll < 0.8) {
    return {
      ...occurrence(random),
      elements: children,
      name: `G${depth}${Math.floor(random() * 10)}`,
      type: "group",
    };
  }
  return { ...occurrence(random), alternatives: children, type: "choice" };
}

function elements(depth: number, random: Random): StructureElement[] {
  const width = 1 + Math.floor(random() * MAX_WIDTH);
  return Array.from({ length: width }, () => element(depth, random));
}

const matchesNothing = (item: StructureElement): boolean =>
  item.optional ||
  (item.type === "group" && item.elements.every(matchesNothing)) ||
  (item.type === "choice" && item.alternatives.some(matchesNothing));

const hasEmptyAlternative = (items: readonly StructureElement[]): boolean =>
  items.some(
    (item) =>
      (item.type === "choice" &&
        (item.alternatives.some(matchesNothing) ||
          hasEmptyAlternative(item.alternatives))) ||
      (item.type === "group" && hasEmptyAlternative(item.elements))
  );

describe("matchStructure on random structures", () => {
  it("agrees with the reference parser on nested, nullable, and ambiguous structures", () => {
    const random = seeded(20_260_919);
    const disagreements: string[] = [];
    let compared = 0;

    for (let s = 0; s < STRUCTURES; s += 1) {
      const structure: MessageStructure = {
        elements: [
          { name: "MSH", optional: false, repeating: false, type: "segment" },
          ...elements(0, random),
        ],
        id: `R${s}`,
      };
      if (hasEmptyAlternative(structure.elements)) {
        continue;
      }
      compared += 1;

      for (let n = 0; n < MESSAGES_PER_STRUCTURE; n += 1) {
        const valid = validMessage(structure, random).slice(0, 14);
        for (const input of [valid, nearMiss(valid, NAMES, random)]) {
          const got = JSON.stringify(matchStructure(structure, input));
          const want = JSON.stringify(referenceMatch(structure, input));
          if (got !== want && disagreements.length < 5) {
            disagreements.push(
              `${JSON.stringify(structure.elements)} on ${input.join(" ")}: vm ${got} ref ${want}`
            );
          }
        }
      }
    }

    expect(compared).toBeGreaterThan(STRUCTURES / 3);
    expect(disagreements).toEqual([]);
  });
});
