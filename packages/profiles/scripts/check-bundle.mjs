/**
 * Checks the bundled event schemas, against the built package.
 *
 * Runs as the last step of `pnpm build`, so what is checked is what ships:
 *
 * 1. Every schema file matches `event-schema.schema.json` and names it in
 *    `$schema`.
 * 2. Every event map entry names a bundled schema, and every bundled schema maps
 *    to itself.
 * 3. Every schema loads, compiles, and accepts messages generated from it.
 * 4. `runner` groups those messages exactly as `referenceMatch` does, and the two
 *    agree on near misses.
 *
 * `referenceMatch` is a second implementation of the grouping semantics, a
 * backtracking parser over the schema data that shares no code with the
 * compiler or the VM. It defines the answer the engine is held to: a
 * disagreement is a bug in one of them, so decide which before changing
 * either. Changing the engine's priorities means changing both.
 *
 * The engine's tests import `referenceMatch` and the message generators from
 * this file; the check itself runs only when the file is executed.
 *
 * @typedef {import("../src/event-schema/types").EventSchema} EventSchema
 *
 * @typedef {import("../src/event-schema/types").EventSchemaElement} EventSchemaElement
 *
 * @typedef {import("../src/event-schema/types").SegmentMatch} SegmentMatch
 *
 * @typedef {() => number} Random
 */

import { readdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MESSAGES_PER_SCHEMA = 12;
const MAX_SEGMENTS = 60;
const MAX_EXTRA_REPETITIONS = 3;
const MODULUS = 2_147_483_647;
const MULTIPLIER = 48_271;
const REPORTED_PROBLEMS = 20;
const PROFILES = new URL("../src/profiles/", import.meta.url);

// ---------------------------------------------------------------------------
// Messages generated from a schema
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
 * A segment-name sequence the schema accepts.
 *
 * @param {EventSchema} schema - The schema to expand.
 * @param {Random} random - Decides optional elements, repetitions, and choices.
 * @returns {string[]} The segment names, in order.
 */
export function validMessage(schema, random) {
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

  for (const element of schema.elements) {
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
// The reference: a greedy backtracking parser over the schema data
// ---------------------------------------------------------------------------

/**
 * The grouping of `input` under `schema`, or `undefined` when `input` does
 * not fit it.
 *
 * Continuations are hash-consed (one closure per logical continuation) and
 * their failures memoized per input position, which keeps backtracking
 * polynomial. Only failures are memoized, so the first success in priority
 * order is still the one returned.
 *
 * @param {EventSchema} schema - The schema to match against.
 * @param {readonly string[]} input - The message's segment names.
 * @returns {SegmentMatch[] | undefined} Segment indexes nested in groups.
 */
// oxlint-disable-next-line complexity/complexity -- backtracking grammar parser: the branches are the schema's element kinds and the greedy occurrence order
export function referenceMatch(schema, input) {
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
  if (!sequence(schema.elements, 0, 0, end)) {
    return;
  }

  /** @type {SegmentMatch[]} */
  const root = [];
  /** @type {{ name: string; children: SegmentMatch[] }[]} */
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

const bundledEventSchemas = () =>
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
  const { eventMaps, profiles, runner } = await import("../dist/index.js");

  const bundled = bundledEventSchemas();
  /** @type {string[]} */
  const problems = [];

  // 1. The event schema files match the JSON Schema they name.
  const jsonSchema = readJson(new URL("event-schema.schema.json", PROFILES));
  const validate = new Ajv({ allErrors: true }).compile(jsonSchema);

  for (const { id, url, version } of bundled) {
    const schema = readJson(url);
    if (!validate(schema)) {
      problems.push(`v${version}/${id} does not match the schema`);
    } else if (schema.$schema !== jsonSchema.$id) {
      problems.push(`v${version}/${id} names ${schema.$schema} in $schema`);
    }
  }

  // 2. The event maps and the schema files agree.
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

  // 3 and 4. The engine runs every schema as the reference does.
  for (const { id, version } of bundled) {
    const schema = await profiles.events.load(version, id, {
      resolve: false,
    });
    const random = seeded(version.length * 31 + id.length);
    const names = [...new Set(validMessage(schema, random))];

    for (let n = 0; n < MESSAGES_PER_SCHEMA; n += 1) {
      const valid = validMessage(schema, random);
      const miss = nearMiss(valid, names, random);
      const result = runner(schema, valid);

      if (result.type !== "matched") {
        problems.push(`v${version}/${id} rejects ${valid.join(" ")}`);
      } else if (
        JSON.stringify(result.groups) !==
        JSON.stringify(referenceMatch(schema, valid))
      ) {
        problems.push(
          `v${version}/${id} groups ${valid.join(" ")} differently`
        );
      }
      if (
        (runner(schema, miss).type === "matched") !==
        (referenceMatch(schema, miss) !== undefined)
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
      `${problems.length} problem(s) in the bundled event schemas:\n${problems
        .slice(0, REPORTED_PROBLEMS)
        .map((problem) => `  ${problem}\n`)
        .join("")}`
    );
    process.exit(1);
  }

  process.stdout.write(
    `${bundledEventSchemas().length} event schemas checked\n`
  );
}
