/**
 * @module @glion/check-actions/pins
 * @file Collects `uses:` references from workflow files and judges each
 *   against the tags, commit date, and latest version of its repository.
 *   No network access; the facts are supplied by the caller.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOW_FILE = /\.ya?ml$/;
const USES_LINE =
  /^\s*(?:-\s+)?uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:\/[^@\s]+)?@(\S+)(?:\s*#\s*(\S+))?/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const VERSION_TAG = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/;
const SHORT_SHA_LENGTH = 7;

/**
 * One `uses:` reference in a workflow file.
 *
 * @typedef {object} Pin
 * @property {string} file Workflow file name.
 * @property {number} line 1-based line number.
 * @property {string} repo `owner/name` of the action repository.
 * @property {string} ref The text after `@`: a 40-hex SHA, a tag, or a branch.
 * @property {string | undefined} comment First token of the trailing `#`
 *   comment, if any.
 */

/**
 * What the repository says about one pin.
 *
 * @typedef {object} Facts
 * @property {string[]} tags Tags whose commit is `ref`. Empty when `ref` is not
 *   a SHA or no tag points at it.
 * @property {string | undefined} date `YYYY-MM-DD` the pinned commit was
 *   committed. `undefined` when the commit is unknown.
 * @property {string | undefined} latest Newest version tag published by the
 *   repository. `undefined` when it has none.
 */

/**
 * A judged pin.
 *
 * @typedef {object} Row
 * @property {Pin[]} pins Every reference sharing this `repo@ref`.
 * @property {string} repo `owner/name` of the action repository.
 * @property {string} ref The text after `@`.
 * @property {string | undefined} comment Version comment of the first pin.
 * @property {Facts} facts What the repository says about `ref`.
 * @property {"ok" | "mismatch" | "unpinned"} status `ok` when `comment` is a
 *   tag at `ref`.
 * @property {"current" | "newer" | "unknown"} latestStatus `newer` when
 *   `facts.latest` is a higher version than the pin.
 */

/**
 * Every `uses:` reference in the workflow files of `workflowsDir`, in file
 * name then line order.
 *
 * @param {string} workflowsDir Directory holding `*.yml` / `*.yaml` workflow
 *   files.
 * @returns {Pin[]} One entry per `uses:` line.
 */
export function collectPins(workflowsDir) {
  const pins = [];
  const files = readdirSync(workflowsDir)
    .filter((file) => WORKFLOW_FILE.test(file))
    .toSorted();
  for (const file of files) {
    const lines = readFileSync(join(workflowsDir, file), "utf8").split("\n");
    for (const [index, text] of lines.entries()) {
      const match = USES_LINE.exec(text);
      if (match) {
        pins.push({
          comment: match[3],
          file,
          line: index + 1,
          ref: match[2],
          repo: match[1],
        });
      }
    }
  }
  return pins;
}

/**
 * Whether `ref` is a full 40-hex commit SHA.
 *
 * @param {string} ref The text after `@` in a `uses:` line.
 * @returns {boolean} `true` for 40 lowercase hex characters.
 */
export function isSha(ref) {
  return FULL_SHA.test(ref);
}

/**
 * `[major, minor, patch]` parsed from a version tag, or `undefined` when
 * the tag is not `v?MAJOR[.MINOR[.PATCH]]`.
 *
 * @param {string} tag A git tag name.
 * @returns {[number, number, number] | undefined} Missing minor and patch read
 *   as 0.
 */
export function parseVersion(tag) {
  const match = VERSION_TAG.exec(tag);
  if (!match) {
    return;
  }
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

/**
 * Negative when `a` is lower than `b`, positive when higher, zero when equal.
 *
 * @param {[number, number, number]} a Left version.
 * @param {[number, number, number]} b Right version.
 * @returns {number} Sign of `a - b` on the first differing component.
 */
export function compareVersions(a, b) {
  for (const index of [0, 1, 2]) {
    if (a[index] !== b[index]) {
      return a[index] - b[index];
    }
  }
  return 0;
}

/**
 * The highest version tag among `tags`, or `undefined` when none parses.
 * Among tags of equal version the most specific spelling wins
 * (`v5.1.0` over `v5`).
 *
 * @param {Iterable<string>} tags Candidate tag names.
 * @returns {string | undefined} The winning tag as spelled in `tags`.
 */
export function highestVersion(tags) {
  let best;
  for (const tag of tags) {
    const version = parseVersion(tag);
    if (!version) {
      continue;
    }
    if (!best) {
      best = { tag, version };
      continue;
    }
    const order = compareVersions(version, best.version);
    if (order > 0 || (order === 0 && tag.length > best.tag.length)) {
      best = { tag, version };
    }
  }
  return best?.tag;
}

/**
 * Groups `pins` by `repo@ref`, preserving first-seen order.
 *
 * @param {Pin[]} pins References in any order.
 * @returns {Map<string, Pin[]>} Keyed by `repo@ref`.
 */
export function groupPins(pins) {
  const groups = new Map();
  for (const pin of pins) {
    const key = `${pin.repo}@${pin.ref}`;
    const group = groups.get(key);
    if (group) {
      group.push(pin);
    } else {
      groups.set(key, [pin]);
    }
  }
  return groups;
}

/**
 * Judges one group of pins against `facts`.
 *
 * @param {Pin[]} pins Non-empty; all share `repo` and `ref`.
 * @param {Facts} facts What the repository says about the shared `ref`.
 * @returns {Row} The group with its verdicts.
 */
export function judge(pins, facts) {
  const [{ repo, ref, comment }] = pins;
  let status = "unpinned";
  if (isSha(ref)) {
    status = comment && facts.tags.includes(comment) ? "ok" : "mismatch";
  }

  const pinnedVersion = parseVersion(
    highestVersion(facts.tags) ?? comment ?? ref
  );
  const latestVersion = facts.latest ? parseVersion(facts.latest) : undefined;
  let latestStatus = "unknown";
  if (pinnedVersion && latestVersion) {
    latestStatus =
      compareVersions(latestVersion, pinnedVersion) > 0 ? "newer" : "current";
  }

  return { comment, facts, latestStatus, pins, ref, repo, status };
}

/**
 * The repository lookups {@link checkActions} needs.
 *
 * @typedef {object} Repository
 * @property {(repo: string) => Map<string, string[]>} tagsByCommit Every tag of
 *   `repo`, keyed by the commit it points at.
 * @property {(repo: string, sha: string) => Promise<string | undefined>} commitDate
 *   `YYYY-MM-DD` the commit was committed, or `undefined` when unknown.
 * @property {(repo: string) => Promise<string | undefined>} latestRelease Tag
 *   name of the latest release, or `undefined` when there are none.
 */

/**
 * One judged row per distinct `repo@ref` in `pins`, in first-seen order.
 *
 * Calls `tagsByCommit` and `latestRelease` once per repository and
 * `commitDate` once per SHA-pinned group. When a repository has no
 * release, or its latest release tag is not a version, `latest` is its
 * highest version tag. Rejects when any lookup rejects.
 *
 * @param {Pin[]} pins References in any order.
 * @param {Repository} repository The lookups.
 * @returns {Promise<Row[]>} The judged groups.
 */
export async function checkActions(pins, repository) {
  const groups = [...groupPins(pins).values()];
  const repos = new Map(
    await Promise.all(
      [...new Set(groups.map(([{ repo }]) => repo))].map(async (repo) => {
        const tags = repository.tagsByCommit(repo);
        const release = await repository.latestRelease(repo);
        const latest =
          release !== undefined && parseVersion(release)
            ? release
            : highestVersion([...tags.values()].flat());
        return [repo, { latest, tags }];
      })
    )
  );
  return Promise.all(
    groups.map(async (group) => {
      const [{ repo, ref }] = group;
      const { tags, latest } = repos.get(repo);
      const date = isSha(ref)
        ? await repository.commitDate(repo, ref)
        : undefined;
      return judge(group, { date, latest, tags: tags.get(ref) ?? [] });
    })
  );
}

/**
 * Rows rendered as an aligned plain-text table with a header line.
 *
 * @param {Row[]} rows Judged groups, one per table row.
 * @returns {string} Lines joined by `\n`, no trailing newline.
 */
export function formatTable(rows) {
  const header = [
    "Action",
    "Pinned",
    "Comment",
    "Tags at SHA",
    "Status",
    "Committed",
    "Latest",
    "Where",
  ];
  const cells = rows.map((row) => [
    row.repo,
    row.ref.length > SHORT_SHA_LENGTH
      ? row.ref.slice(0, SHORT_SHA_LENGTH)
      : row.ref,
    row.comment ?? "-",
    row.facts.tags.length > 0 ? row.facts.tags.join(", ") : "-",
    row.status,
    row.facts.date ?? "-",
    row.facts.latest ? `${row.facts.latest} (${row.latestStatus})` : "-",
    [...new Set(row.pins.map((pin) => pin.file))].join(", "),
  ]);
  const widths = header.map((title, column) =>
    Math.max(title.length, ...cells.map((line) => line[column].length))
  );
  const render = (line) =>
    line
      .map((cell, column) => cell.padEnd(widths[column]))
      .join("  ")
      .trimEnd();
  return [render(header), ...cells.map(render)].join("\n");
}

/**
 * Human-readable reasons `rows` fail the check, one per offending
 * reference, with `file:line`. Empty when every row is `ok`.
 *
 * @param {Row[]} rows Judged groups.
 * @returns {string[]} One reason per offending reference.
 */
export function failures(rows) {
  const reasons = [];
  for (const row of rows) {
    if (row.status === "ok") {
      continue;
    }
    for (const pin of row.pins) {
      const where = `${pin.file}:${pin.line} ${row.repo}@${row.ref}`;
      if (row.status === "unpinned") {
        reasons.push(`${where} is not pinned to a full commit SHA`);
      } else if (row.facts.tags.length === 0) {
        reasons.push(
          `${where} has no tag pointing at it${row.facts.date ? "" : " (commit not found)"}`
        );
      } else {
        reasons.push(
          `${where} comment "${row.comment ?? ""}" is not a tag at this SHA (tags: ${row.facts.tags.join(", ")})`
        );
      }
    }
  }
  return reasons;
}
