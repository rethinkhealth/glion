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
 */

import { readdirSync, readFileSync } from "node:fs";

import { Ajv } from "ajv";

import { eventMaps, matchStructure, profiles, runner } from "../dist/index.js";
import type { MessageStructure, StructureProgram } from "../dist/index.js";
import { nearMiss, seeded, validMessage } from "./messages.ts";
import { referenceMatch } from "./reference.ts";

const MESSAGES_PER_STRUCTURE = 12;
const PROFILES = new URL("../src/profiles/", import.meta.url);

const readJson = (url: URL): unknown => JSON.parse(readFileSync(url, "utf8"));

const accepts = (program: StructureProgram, input: readonly string[]) => {
  const automaton = runner(program);
  return (
    input.every((name) => automaton.consume(name).type === "step") &&
    automaton.accepted
  );
};

const bundled = readdirSync(PROFILES)
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

const problems: string[] = [];

// 1. The structure files match the schema they name.
const schema = readJson(new URL("message-structure.schema.json", PROFILES)) as {
  $id: string;
};
const validate = new Ajv({ allErrors: true }).compile(schema);

for (const { id, url, version } of bundled) {
  const structure = readJson(url) as { $schema?: string };
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
      problems.push(`v${version}/${event} maps to ${id}, which is not bundled`);
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
  const definition = await profiles.events.load(version, id, {
    resolve: false,
  });
  const structure: MessageStructure = definition.structure;
  const random = seeded(version.length * 31 + id.length);
  const names = [...new Set(validMessage(structure, random))];

  for (let n = 0; n < MESSAGES_PER_STRUCTURE; n += 1) {
    const valid = validMessage(structure, random);
    const miss = nearMiss(valid, names, random);
    const matched = matchStructure(definition.program, valid);

    if (!accepts(definition.program, valid) || matched === undefined) {
      problems.push(`v${version}/${id} rejects ${valid.join(" ")}`);
    } else if (
      JSON.stringify(matched) !==
      JSON.stringify(referenceMatch(structure, valid))
    ) {
      problems.push(`v${version}/${id} groups ${valid.join(" ")} differently`);
    }
    if (
      accepts(definition.program, miss) !==
      (matchStructure(definition.program, miss) !== undefined)
    ) {
      problems.push(`v${version}/${id} disagrees on ${miss.join(" ")}`);
    }
  }
}

if (problems.length > 0) {
  process.stderr.write(
    `${problems.length} problem(s) in the bundled message structures:\n${problems
      .slice(0, 20)
      .map((problem) => `  ${problem}\n`)
      .join("")}`
  );
  process.exit(1);
}

process.stdout.write(`${bundled.length} message structures checked\n`);
