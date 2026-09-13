#!/usr/bin/env node

/**
 * @module @glion/check-repo-config/cli
 * @file CLI entrypoint for `glion-check-repo-config`. Diffs the live
 *   configuration of the repository named by `GITHUB_REPOSITORY` (default
 *   `rethinkhealth/glion`) against `.github/repo-baseline/`.
 *   Exit 0 when every object matches, 1 on drift, 2 when an object could not
 *   be read. `--update` rewrites the baseline from the live configuration.
 *   Usage:
 *   glion-check-repo-config [--update] [baselineDir]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  diff,
  projectActions,
  projectCodeScanning,
  projectEnvironments,
  projectRepository,
  projectRuleset,
  stable,
} from "./baseline.mjs";
import { ghApi, ruleset } from "./github.mjs";

const EXIT_DRIFT = 1;
const EXIT_UNREADABLE = 2;

const args = process.argv.slice(2);
const update = args.includes("--update");
const baselineDir =
  args.find((arg) => !arg.startsWith("--")) ??
  join(process.cwd(), ".github", "repo-baseline");
const repo = process.env.GITHUB_REPOSITORY ?? "rethinkhealth/glion";

/**
 * @type {Record<string, () => unknown>} Baseline file name to the live
 *   projection.
 */
const objects = {
  "actions.json": () =>
    projectActions(
      ghApi(`repos/${repo}/actions/permissions`),
      ghApi(`repos/${repo}/actions/permissions/workflow`)
    ),
  "code-scanning.json": () =>
    projectCodeScanning(ghApi(`repos/${repo}/code-scanning/default-setup`)),
  "environments.json": () =>
    projectEnvironments(ghApi(`repos/${repo}/environments`)),
  "repository.json": () =>
    projectRepository(
      ghApi(`repos/${repo}`),
      ghApi(`repos/${repo}/private-vulnerability-reporting`)
    ),
  "ruleset-main.json": () => projectRuleset(ruleset(repo, "default")),
};

let drifted = 0;
let unreadable = 0;
for (const [file, live] of Object.entries(objects)) {
  const target = join(baselineDir, file);
  let projection;
  try {
    projection = live();
  } catch (error) {
    unreadable += 1;
    console.error(
      `✗ ${file}: could not read the live configuration\n    ${error.message}`
    );
    continue;
  }
  if (update) {
    writeFileSync(target, stable(projection));
    console.log(`↻ ${file} written from ${repo}`);
    continue;
  }
  const differences = diff(
    JSON.parse(readFileSync(target, "utf8")),
    projection
  );
  if (differences.length === 0) {
    console.log(`✓ ${file} matches ${repo}`);
    continue;
  }
  drifted += 1;
  console.error(`✗ ${file} drifted from the baseline:`);
  for (const { path, expected, actual } of differences) {
    console.error(
      `    ${path}: baseline ${JSON.stringify(expected)}, live ${JSON.stringify(actual)}`
    );
  }
}

if (unreadable > 0) {
  console.error(
    `\n${unreadable} object(s) could not be read; the Actions and code scanning objects need a token with administration read`
  );
  process.exit(EXIT_UNREADABLE);
}
if (drifted > 0) {
  console.error(
    `\n${drifted} object(s) drifted; review the change, then either revert it or update the baseline in a pull request (--update)`
  );
  process.exit(EXIT_DRIFT);
}
