#!/usr/bin/env node

/**
 * @module @glion/release-notes/cli
 * @file CLI entrypoint for `glion-release-notes <version>`.
 *   Lists the workspace with pnpm, reads the `CHANGELOG.md` of every public
 *   package, and prints the notes for `<version>` to stdout.
 */

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { releaseNotes } from "./notes.mjs";

/**
 * The `CHANGELOG.md` in `path`, or `""` when the package has none.
 *
 * Changesets writes a package's changelog on its first release.
 *
 * @param {string} path The package directory.
 * @returns {Promise<string>} The changelog text.
 */
async function readChangelog(path) {
  try {
    return await readFile(join(path, "CHANGELOG.md"), "utf8");
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

const [version] = process.argv.slice(2);
if (version === undefined) {
  console.error("usage: glion-release-notes <version>");
  process.exit(1);
}

/** @type {{ name: string; path: string; private?: boolean }[]} */
const workspace = JSON.parse(
  execFileSync("pnpm", ["ls", "--recursive", "--depth", "-1", "--json"], {
    encoding: "utf8",
  })
);

const packages = await Promise.all(
  workspace
    .filter((pkg) => pkg.private !== true)
    .map(async ({ name, path }) => ({
      changelog: await readChangelog(path),
      name,
    }))
);

process.stdout.write(releaseNotes(packages, version));
