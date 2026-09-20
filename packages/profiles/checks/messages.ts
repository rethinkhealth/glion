// Deterministic segment-name sequences for a MessageStructure: valid ones
// expanded from the structure, and near misses derived from them.
import type {
  MessageStructure,
  StructureElement,
} from "../src/structure/types.ts";

const MAX_SEGMENTS = 60;
const MAX_EXTRA_REPETITIONS = 3;

export type Random = () => number;

const MODULUS = 2_147_483_647;
const MULTIPLIER = 48_271;

/** Park–Miller: a seeded generator, so every run sees the same messages. */
export function seeded(seed: number): Random {
  let state = (seed % (MODULUS - 1)) + 1;
  return () => {
    state = (state * MULTIPLIER) % MODULUS;
    return (state - 1) / (MODULUS - 1);
  };
}

/** A segment-name sequence the structure accepts. */
export function validMessage(
  structure: MessageStructure,
  random: Random
): string[] {
  const out: string[] = [];

  const count = (element: StructureElement): number => {
    const full = out.length >= MAX_SEGMENTS;
    const min = element.optional ? 0 : 1;
    if (full) {
      return min;
    }
    let n = element.optional && random() < 0.5 ? 0 : 1;
    while (
      element.repeating &&
      n > 0 &&
      n <= MAX_EXTRA_REPETITIONS &&
      random() < 0.5
    ) {
      n += 1;
    }
    return Math.max(n, min);
  };

  const emit = (element: StructureElement): void => {
    for (let n = count(element); n > 0; n -= 1) {
      switch (element.type) {
        case "segment": {
          out.push(element.name === "Hxx" ? "ZZ1" : element.name);
          break;
        }
        case "group": {
          for (const child of element.elements) {
            emit(child);
          }
          break;
        }
        case "choice": {
          const pick = Math.floor(random() * element.alternatives.length);
          emit(element.alternatives[pick] as StructureElement);
          break;
        }
      }
    }
  };

  for (const element of structure.elements) {
    emit(element);
  }
  return out;
}

/** `message` with one segment removed or one segment name inserted. */
export function nearMiss(
  message: readonly string[],
  names: readonly string[],
  random: Random
): string[] {
  const out = [...message];
  const at = Math.floor(random() * (out.length + 1));
  if (random() < 0.5 && out.length > 0) {
    out.splice(Math.min(at, out.length - 1), 1);
  } else {
    out.splice(at, 0, names[Math.floor(random() * names.length)] as string);
  }
  return out;
}
