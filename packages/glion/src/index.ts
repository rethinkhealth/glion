#!/usr/bin/env node
/**
 * CLI entry point — the file `bin.glion` in package.json points here.
 *
 * When a user runs `glion dev` or `glion start`, npm/pnpm resolves the
 * `glion` binary to this file. The shebang above tells the OS to
 * execute it with Node (Bun and Deno ignore the shebang and run it
 * natively via their own invocation commands).
 *
 * This file is intentionally thin: it bridges the shell world (argv,
 * exit codes, stderr) into the programmatic `runGlion()` entry in
 * run.ts. All actual logic lives there so that embedders can call
 * `runGlion()` directly without spawning a subprocess.
 */
// Dynamic import so tsdown doesn't merge index and run into a shared chunk.
const { runGlion } = await import("./run.js");

try {
  // runGlion() owns the full program lifecycle — it only resolves once
  // all commands, servers, and signal handlers have finished. The
  // resolved value is the exit code we forward to the OS.
  const code = await runGlion({
    argv: process.argv.slice(2),
    cwd: process.cwd(),
  });
  process.exit(code);
} catch (error) {
  // This catch should never fire — runGlion handles its own errors and
  // returns an exit code. If we get here, something truly unexpected
  // happened (bug in the arg parser, unhandled rejection in a dep).
  process.stderr.write(
    `glion: unexpected error: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
}
