/**
 * @module @glion/check-actions/github
 * @file Reads tags, commit dates, and latest releases from GitHub.
 */

import { execFileSync } from "node:child_process";

const API = "https://api.github.com";
const TAG_PREFIX = "refs/tags/";
const PEELED_SUFFIX = "^{}";
const DATE_LENGTH = 10;

/**
 * A token for the GitHub API: `GITHUB_TOKEN`, then `GH_TOKEN`, then the
 * `gh` CLI's stored token. `undefined` when none is available; requests
 * then run anonymously under the 60-per-hour limit.
 *
 * @returns {string | undefined} The token, or `undefined` for anonymous access.
 */
export function githubToken() {
  const fromEnv = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (fromEnv) {
    return fromEnv;
  }
  try {
    return execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // `gh` is not installed or not logged in: anonymous access is a supported mode.
  }
}

/**
 * Every tag of `repo`, keyed by the commit it points at. Annotated tags
 * are peeled to their commit.
 *
 * @param {string} repo `owner/name`.
 * @returns {Map<string, string[]>} Commit SHA to the tags at that commit.
 * @throws When `git ls-remote` fails.
 */
export function tagsByCommit(repo) {
  const output = execFileSync(
    "git",
    ["ls-remote", "--tags", `https://github.com/${repo}`],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  const byCommit = new Map();
  const objects = new Map();
  const peeled = new Set();
  const add = (sha, tag) => {
    const tags = byCommit.get(sha);
    if (tags) {
      tags.push(tag);
    } else {
      byCommit.set(sha, [tag]);
    }
  };
  for (const line of output.split("\n")) {
    if (!line) {
      continue;
    }
    const [sha, ref] = line.split("\t");
    const name = ref.slice(TAG_PREFIX.length);
    if (name.endsWith(PEELED_SUFFIX)) {
      const tag = name.slice(0, -PEELED_SUFFIX.length);
      peeled.add(tag);
      add(sha, tag);
    } else {
      objects.set(name, sha);
    }
  }
  for (const [tag, sha] of objects) {
    if (!peeled.has(tag)) {
      add(sha, tag);
    }
  }
  return byCommit;
}

/**
 * @param {string} path API path starting with `/`.
 * @param {string | undefined} token Bearer token, or `undefined` for anonymous
 *   access.
 * @returns {Promise<unknown>} Parsed JSON body, or `undefined` on 404.
 * @throws On any other non-2xx response.
 */
async function api(path, token) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "glion-check-actions",
  };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${API}${path}`, { headers });
  if (response.status === 404) {
    return;
  }
  if (!response.ok) {
    throw new Error(
      `GitHub API ${response.status} for ${path}: ${await response.text()}`
    );
  }
  return response.json();
}

/**
 * `YYYY-MM-DD` the commit `sha` of `repo` was committed, or `undefined`
 * when the repository has no such commit.
 *
 * @param {string} repo `owner/name`.
 * @param {string} sha Full commit SHA.
 * @param {string | undefined} token Bearer token, or `undefined` for anonymous
 *   access.
 * @returns {Promise<string | undefined>} The committer date, or `undefined`
 *   when the commit is unknown.
 */
export async function commitDate(repo, sha, token) {
  const commit = await api(`/repos/${repo}/commits/${sha}`, token);
  return commit?.commit?.committer?.date?.slice(0, DATE_LENGTH);
}

/**
 * Tag name of the latest release of `repo`, or `undefined` when it has
 * no releases.
 *
 * @param {string} repo `owner/name`.
 * @param {string | undefined} token Bearer token, or `undefined` for anonymous
 *   access.
 * @returns {Promise<string | undefined>} The release's `tag_name`, or
 *   `undefined` when there are no releases.
 */
export async function latestRelease(repo, token) {
  const release = await api(`/repos/${repo}/releases/latest`, token);
  return release?.tag_name;
}
