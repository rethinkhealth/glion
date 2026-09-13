/**
 * @module @glion/check-repo-config/github
 * @file Reads repository configuration objects through the `gh` CLI, which
 *   authenticates with `GH_TOKEN` or its stored login.
 */

import { execFileSync } from "node:child_process";

/**
 * The parsed JSON body of `GET {path}`.
 *
 * @param {string} path API path relative to `https://api.github.com/`.
 * @returns {unknown} The body.
 * @throws When `gh api` exits non-zero, with its stderr in the message.
 */
export function ghApi(path) {
  try {
    return JSON.parse(
      execFileSync("gh", ["api", path], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
    );
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr).trim() : error.message;
    throw new Error(`gh api ${path}: ${stderr}`, { cause: error });
  }
}

/**
 * The repository ruleset named `name`, fetched by id so `rules` are
 * populated.
 *
 * @param {string} repo `owner/name`.
 * @param {string} name The ruleset name.
 * @returns {unknown} The ruleset.
 * @throws When no ruleset has that name.
 */
export function ruleset(repo, name) {
  const listing = ghApi(`repos/${repo}/rulesets`);
  const match = listing.find((entry) => entry.name === name);
  if (!match) {
    throw new Error(`repository ${repo} has no ruleset named "${name}"`);
  }
  return ghApi(`repos/${repo}/rulesets/${match.id}`);
}
