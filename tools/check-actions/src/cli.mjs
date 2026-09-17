#!/usr/bin/env node

/**
 * @module @glion/check-actions/cli
 * @file CLI entrypoint for `glion-check-actions`. Prints one table row per
 *   distinct `repo@ref` found in the workflow directory and exits 1 when any
 *   reference is unpinned or its version comment is not a tag at its SHA.
 *   Usage:
 *   glion-check-actions                    # checks ./.github/workflows
 *   glion-check-actions <workflowsDir>     # checks the given directory
 */

import { join } from "node:path";

import {
  commitDate,
  githubToken,
  latestRelease,
  tagsByCommit,
} from "./github.mjs";
import { checkActions, collectPins, failures, formatTable } from "./pins.mjs";

const workflowsDir =
  process.argv[2] ?? join(process.cwd(), ".github", "workflows");
const token = githubToken();

const rows = await checkActions(collectPins(workflowsDir), {
  commitDate: (repo, sha) => commitDate(repo, sha, token),
  latestRelease: (repo) => latestRelease(repo, token),
  tagsByCommit,
});

console.log(formatTable(rows));

const reasons = failures(rows);
if (reasons.length > 0) {
  console.error(`\n✗ ${reasons.length} reference(s) failed:`);
  for (const reason of reasons) {
    console.error(`  - ${reason}`);
  }
  process.exit(1);
}
console.log(`\n✓ ${rows.length} pinned action(s) verified`);
