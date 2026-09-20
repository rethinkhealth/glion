/**
 * Checks the bundled message structures, against the built package.
 *
 * Runs as the last step of `pnpm build`, so what is checked is what ships:
 *
 * 1. Every structure file matches `message-structure.schema.json` and names it in
 *    `$schema`.
 * 2. Every event map entry names a bundled structure, and every bundled structure
 *    maps to itself.
 * 3. Every structure loads, compiles, and accepts messages generated from it.
 * 4. `matchStructure` groups those messages exactly as `referenceMatch` does, and
 *    the two agree on near misses.
 *
 * `referenceMatch` is a second implementation of the grouping semantics, a
 * backtracking parser over the structure data that shares no code with the
 * compiler or the VM. It defines the answer the engine is held to: a
 * disagreement is a bug in one of them, so decide which before changing
 * either. Changing the priorities in `compileStructure` means changing both.
 *
 * The engine's tests import `referenceMatch` and the message generators from
 * this file; the check itself runs only when the file is executed.
 *
 * @typedef {import("../src/structure/types").MessageStructure} MessageStructure
 *
 * @typedef {import("../src/structure/types").StructureElement} StructureElement
 *
 * @typedef {import("../src/structure/types").StructureMatch} StructureMatch
 *
 * @typedef {import("../src/structure/types").StructureProgram} StructureProgram
 *
 * @typedef {() => number} Random
 */

import { readdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MESSAGES_PER_STRUCTURE = 12;
const MAX_SEGMENTS = 60;
const MAX_EXTRA_REPETITIONS = 3;
const MODULUS = 2_147_483_647;
const MULTIPLIER = 48_271;
const REPORTED_PROBLEMS = 20;
const PROFILES = new URL("../src/profiles/", import.meta.url);

// ---------------------------------------------------------------------------
// Messages generated from a structure
// ---------------------------------------------------------------------------

/**
 * Park–Miller: a seeded generator, so every run sees the same messages.
 *
 * @param {number} seed - The seed; equal seeds give equal sequences.
 * @returns {Random} A generator of numbers in [0, 1).
 */
export function seeded(seed) {
  let state = (seed % (MODULUS - 1)) + 1;
  return () => {
    state = (state * MULTIPLIER) % MODULUS;
    return (state - 1) / (MODULUS - 1);
  };
}

/**
 * A segment-name sequence the structure accepts.
 *
 * @param {MessageStructure} structure - The structure to expand.
 * @param {Random} random - Decides optional elements, repetitions, and choices.
 * @returns {string[]} The segment names, in order.
 */
export function validMessage(structure, random) {
  /** @type {string[]} */
  const out = [];

  const count = (element) => {
    const min = element.optional ? 0 : 1;
    if (out.length >= MAX_SEGMENTS) {
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

  const emit = (element) => {
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
          const alternative = element.alternatives[pick];
          if (alternative) {
            emit(alternative);
          }
          break;
        }
        default: {
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

/**
 * `message` with one segment removed or one segment name inserted.
 *
 * @param {readonly string[]} message - A valid message.
 * @param {readonly string[]} names - The segment names an insertion draws from.
 * @param {Random} random - Decides the edit and its position.
 * @returns {string[]} The edited message.
 */
export function nearMiss(message, names, random) {
  const out = [...message];
  const at = Math.floor(random() * (out.length + 1));
  if (random() < 0.5 && out.length > 0) {
    out.splice(Math.min(at, out.length - 1), 1);
  } else {
    out.splice(at, 0, names[Math.floor(random() * names.length)] ?? "ZZ1");
  }
  return out;
}

// ---------------------------------------------------------------------------
// The reference: a greedy backtracking parser over the structure data
// ---------------------------------------------------------------------------

/**
 * The grouping of `input` under `structure`, or `undefined` when `input` does
 * not fit it.
 *
 * Continuations are hash-consed (one closure per logical continuation) and
 * their failures memoized per input position, which keeps backtracking
 * polynomial. Only failures are memoized, so the first success in priority
 * order is still the one returned.
 *
 * @param {MessageStructure} structure - The structure to match against.
 * @param {readonly string[]} input - The message's segment names.
 * @returns {StructureMatch[] | undefined} Segment indexes nested in groups.
 */
// oxlint-disable-next-line complexity/complexity -- backtracking grammar parser: the branches are the structure's element kinds and the greedy occurrence order
export function referenceMatch(structure, input) {
  /** @typedef {(at: number) => boolean} Next */
  /** @type {(number | { open: string } | "close")[]} */
  const ops = [];
  /** @type {WeakMap<object, number>} */
  const ids = new WeakMap();
  let nextId = 0;
  /** @type {WeakMap<Next, Map<string, Next>>} */
  const continuations = new WeakMap();
  /** @type {WeakMap<Next, Set<number>>} */
  const failures = new WeakMap();

  const id = (node) => {
    let value = ids.get(node);
    if (value === undefined) {
      value = nextId;
      nextId += 1;
      ids.set(node, value);
    }
    return value;
  };

  const continuation = (outer, key, make) => {
    let byKey = continuations.get(outer);
    if (!byKey) {
      byKey = new Map();
      continuations.set(outer, byKey);
    }
    let next = byKey.get(key);
    if (!next) {
      next = make();
      byKey.set(key, next);
    }
    return next;
  };

  const run = (next, at) => {
    const failed = failures.get(next);
    if (failed?.has(at)) {
      return false;
    }
    if (next(at)) {
      return true;
    }
    if (failed) {
      failed.add(at);
    } else {
      failures.set(next, new Set([at]));
    }
    return false;
  };

  const sequence = (elements, k, at, next) => {
    const element = elements[k];
    if (element === undefined) {
      return run(next, at);
    }
    const rest = continuation(
      next,
      `s${id(elements)}:${k}`,
      () => (j) => sequence(elements, k + 1, j, next)
    );
    return occurrences(element, 0, at, rest);
  };

  /**
   * Greedy: one more occurrence first, then stop. An occurrence beyond the
   * required one must consume at least one segment.
   */
  const occurrences = (element, count, at, next) => {
    const min = element.optional ? 0 : 1;
    const max = element.repeating ? Number.POSITIVE_INFINITY : 1;
    if (count < max) {
      const mark = ops.length;
      const more = continuation(
        next,
        `o${id(element)}:${Math.min(count, 2)}:${at}`,
        () => (j) =>
          (j > at || count < min) && occurrences(element, count + 1, j, next)
      );
      if (once(element, at, more)) {
        return true;
      }
      ops.length = mark;
    }
    return count >= min && run(next, at);
  };

  const once = (element, at, next) => {
    switch (element.type) {
      case "segment": {
        const name = input[at];
        if (
          name === undefined ||
          (element.name !== "Hxx" && element.name !== name)
        ) {
          return false;
        }
        ops.push(at);
        return run(next, at + 1);
      }
      case "group": {
        ops.push({ open: element.name });
        const close = continuation(next, `c${id(element)}`, () => (j) => {
          ops.push("close");
          return run(next, j);
        });
        return sequence(element.elements, 0, at, close);
      }
      case "choice": {
        for (const alternative of element.alternatives) {
          const mark = ops.length;
          if (occurrences(alternative, 0, at, next)) {
            return true;
          }
          ops.length = mark;
        }
        return false;
      }
      default: {
        return false;
      }
    }
  };

  /** @type {Next} */
  const end = (at) => at === input.length;
  if (!sequence(structure.elements, 0, 0, end)) {
    return;
  }

  /** @type {StructureMatch[]} */
  const root = [];
  /** @type {{ name: string; children: StructureMatch[] }[]} */
  const open = [];
  for (const op of ops) {
    const siblings = open.at(-1)?.children ?? root;
    if (typeof op === "number") {
      siblings.push(op);
    } else if (op === "close") {
      const group = open.pop();
      if (group && group.children.length > 0) {
        (open.at(-1)?.children ?? root).push(group);
      }
    } else {
      open.push({ children: [], name: op.open });
    }
  }
  return root;
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

const readJson = (url) => JSON.parse(readFileSync(url, "utf8"));

const bundledStructures = () =>
  readdirSync(PROFILES)
    .filter((entry) => entry.startsWith("v2"))
    .flatMap((version) => {
      const events = new URL(`${version}/events/`, PROFILES);
      return readdirSync(events)
        .filter((file) => file.endsWith(".json"))
        .map((file) => ({
          id: file.slice(0, -".json".length),
          url: new URL(file, events),
          version: version.slice(1),
        }));
    });

/** The problems found in the bundle; empty when there are none. */
// oxlint-disable-next-line complexity/complexity -- four independent checks over the same file list, each a loop with its own failure branches
async function problemsInBundle() {
  const { Ajv } = await import("ajv");
  const { eventMaps, matchStructure, profiles, runner } =
    await import("../dist/index.js");

  const accepts = (program, input) => {
    const automaton = runner(program);
    return (
      input.every((name) => automaton.consume(name).type === "step") &&
      automaton.accepted
    );
  };

  const bundled = bundledStructures();
  /** @type {string[]} */
  const problems = [];

  // 1. The structure files match the schema they name.
  const schema = readJson(new URL("message-structure.schema.json", PROFILES));
  const validate = new Ajv({ allErrors: true }).compile(schema);

  for (const { id, url, version } of bundled) {
    const structure = readJson(url);
    if (!validate(structure)) {
      problems.push(`v${version}/${id} does not match the schema`);
    } else if (structure.$schema !== schema.$id) {
      problems.push(`v${version}/${id} names ${structure.$schema} in $schema`);
    }
  }

  // 2. The event maps and the structure files agree.
  const ids = new Set(bundled.map(({ id, version }) => `v${version}/${id}`));

  for (const [version, map] of Object.entries(eventMaps)) {
    for (const [event, id] of Object.entries(map)) {
      if (!ids.has(`v${version}/${id}`)) {
        problems.push(
          `v${version}/${event} maps to ${id}, which is not bundled`
        );
      }
    }
  }
  for (const { id, version } of bundled) {
    if (eventMaps[version]?.[id] !== id) {
      problems.push(`v${version}/${id} is bundled but maps to itself nowhere`);
    }
  }

  // 3 and 4. The engine runs every structure as the reference does.
  for (const { id, version } of bundled) {
    const { program, structure } = await profiles.events.load(version, id, {
      resolve: false,
    });
    const random = seeded(version.length * 31 + id.length);
    const names = [...new Set(validMessage(structure, random))];

    for (let n = 0; n < MESSAGES_PER_STRUCTURE; n += 1) {
      const valid = validMessage(structure, random);
      const miss = nearMiss(valid, names, random);
      const matched = matchStructure(program, valid);

      if (!accepts(program, valid) || matched === undefined) {
        problems.push(`v${version}/${id} rejects ${valid.join(" ")}`);
      } else if (
        JSON.stringify(matched) !==
        JSON.stringify(referenceMatch(structure, valid))
      ) {
        problems.push(
          `v${version}/${id} groups ${valid.join(" ")} differently`
        );
      }
      if (
        accepts(program, miss) !==
        (matchStructure(program, miss) !== undefined)
      ) {
        problems.push(`v${version}/${id} disagrees on ${miss.join(" ")}`);
      }
    }
  }

  return problems;
}

const executedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (executedDirectly) {
  const problems = await problemsInBundle();

  if (problems.length > 0) {
    process.stderr.write(
      `${problems.length} problem(s) in the bundled message structures:\n${problems
        .slice(0, REPORTED_PROBLEMS)
        .map((problem) => `  ${problem}\n`)
        .join("")}`
    );
    process.exit(1);
  }

  process.stdout.write(
    `${bundledStructures().length} message structures checked\n`
  );
}
