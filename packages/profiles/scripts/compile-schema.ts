/**
 * Prints the program `compile()` makes of an event schema file: the start
 * program counter, then each instruction as it is, one per line.
 *
 * Usage: `pnpm schema:compile <schema.json>` in this package, or
 * `pnpm --filter @glion/profiles schema:compile <schema.json>` from the
 * repository root. A relative path is resolved against the directory `pnpm`
 * ran in.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { compile } from "../src/engine/compile";
import type { EventSchema } from "../src/engine/types";

const [path] = process.argv.slice(2);
if (!path) {
  process.stderr.write("Usage: pnpm schema:compile <schema.json>\n");
  process.exit(2);
}

const file = resolve(process.env.INIT_CWD ?? process.cwd(), path);

// A file that cannot be read, is not JSON, or is not a valid event schema is
// reported by its message alone: the stack trace would point into this script.
try {
  const program = compile(
    JSON.parse(readFileSync(file, "utf8")) as EventSchema
  );
  const width = String(program.code.length - 1).length;
  const lines = program.code.map(
    (instruction, pc) =>
      `${String(pc).padStart(width)}  ${JSON.stringify(instruction)}`
  );
  process.stdout.write(`start ${program.start}\n${lines.join("\n")}\n`);
} catch (error) {
  process.stderr.write(
    `${file}: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
}
