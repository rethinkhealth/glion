import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkActions,
  collectPins,
  compareVersions,
  failures,
  formatTable,
  groupPins,
  highestVersion,
  isSha,
  judge,
  parseVersion,
} from "../src/pins.mjs";

const SHA = "fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09";
const OTHER_SHA = "0977fd99725f1db4007ccb2928dbb4e90d06cc86";

const pin = (
  overrides: Partial<ReturnType<typeof collectPins>[number]> = {}
) => ({
  comment: "v5.1.0",
  file: "ci.yml",
  line: 6,
  ref: SHA,
  repo: "actions/checkout",
  ...overrides,
});

const facts = (overrides: Partial<Parameters<typeof judge>[1]> = {}) => ({
  date: "2026-07-16",
  latest: "v5.1.0",
  tags: ["v5", "v5.1.0"],
  ...overrides,
});

const withWorkflows = (
  files: Record<string, string>,
  run: (dir: string) => void
) => {
  const dir = mkdtempSync(join(tmpdir(), "check-actions-"));
  try {
    for (const [name, text] of Object.entries(files)) {
      writeFileSync(join(dir, name), text);
    }
    run(dir);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
};

describe("collectPins", () => {
  it("reads every owner/name@ref reference with its line and comment", () => {
    const workflow = `name: CI
on: push
jobs:
  a:
    steps:
      - uses: actions/checkout@${SHA} # v5.1.0
        with:
          persist-credentials: false
      - name: Node
        uses: actions/setup-node@v7
      - uses: ./.github/actions/local
      - uses: changesets/action/publish@${OTHER_SHA} # v2.1.2
`;
    withWorkflows({ "ci.yml": workflow, "notes.md": "uses: x/y@v1" }, (dir) => {
      expect(collectPins(dir)).toEqual([
        pin(),
        pin({
          comment: undefined,
          line: 10,
          ref: "v7",
          repo: "actions/setup-node",
        }),
        pin({
          comment: "v2.1.2",
          line: 12,
          ref: OTHER_SHA,
          repo: "changesets/action",
        }),
      ]);
    });
  });

  it("orders files by name", () => {
    withWorkflows(
      {
        "a.yaml": `uses: o/r@${SHA} # v1\n`,
        "b.yml": `uses: o/r@${SHA} # v1\n`,
      },
      (dir) => {
        expect(collectPins(dir).map((entry) => entry.file)).toEqual([
          "a.yaml",
          "b.yml",
        ]);
      }
    );
  });
});

describe("groupPins", () => {
  it("merges references that share repo and ref, preserving first-seen order", () => {
    const a = pin({ file: "a.yml" });
    const b = pin({ file: "b.yml", line: 9 });
    const c = pin({ comment: "v2", file: "b.yml", line: 3, ref: "v2" });
    const groups = groupPins([a, b, c]);
    expect([...groups.keys()]).toEqual([
      `actions/checkout@${SHA}`,
      "actions/checkout@v2",
    ]);
    expect(groups.get(`actions/checkout@${SHA}`)).toEqual([a, b]);
  });
});

describe("versions", () => {
  it("parses v?MAJOR[.MINOR[.PATCH]] and rejects anything else", () => {
    expect(parseVersion("v5")).toEqual([5, 0, 0]);
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("main")).toBeUndefined();
    expect(parseVersion("v1.2.3-rc.1")).toBeUndefined();
  });

  it("compares numerically, not lexically", () => {
    expect(compareVersions([1, 10, 0], [1, 9, 9])).toBeGreaterThan(0);
    expect(compareVersions([0, 6, 4], [1, 0, 0])).toBeLessThan(0);
    expect(compareVersions([2, 0, 0], [2, 0, 0])).toBe(0);
  });

  it("picks the highest, most specific tag and ignores non-versions", () => {
    expect(highestVersion(["v5", "v5.1.0", "v4.2.2", "latest"])).toBe("v5.1.0");
    expect(highestVersion(["v5.1.0", "v5"])).toBe("v5.1.0");
    expect(highestVersion(["main", "nightly"])).toBeUndefined();
    expect(highestVersion([])).toBeUndefined();
  });

  it("isSha accepts only a full 40-hex SHA", () => {
    expect(isSha(SHA)).toBe(true);
    expect(isSha(SHA.slice(0, 7))).toBe(false);
    expect(isSha("v5.1.0")).toBe(false);
  });
});

describe("judge", () => {
  it("is ok when the comment is a tag at the SHA, and compares latest against it", () => {
    expect(judge([pin()], facts())).toMatchObject({
      latestStatus: "current",
      status: "ok",
    });
    expect(judge([pin()], facts({ latest: "v7.0.1" }))).toMatchObject({
      latestStatus: "newer",
      status: "ok",
    });
  });

  it("is a mismatch when the comment is not a tag at the SHA", () => {
    expect(judge([pin()], facts({ tags: ["v4", "v4.3.0"] })).status).toBe(
      "mismatch"
    );
    expect(judge([pin()], facts({ date: undefined, tags: [] })).status).toBe(
      "mismatch"
    );
    expect(judge([pin({ comment: undefined })], facts()).status).toBe(
      "mismatch"
    );
  });

  it("is unpinned for a tag or branch ref, with latest unknown when nothing parses", () => {
    const tag = judge(
      [pin({ comment: undefined, ref: "v7" })],
      facts({ date: undefined, latest: "v7.0.0", tags: [] })
    );
    expect(tag).toMatchObject({ latestStatus: "current", status: "unpinned" });
    const branch = judge(
      [pin({ comment: undefined, ref: "main" })],
      facts({ date: undefined, latest: undefined, tags: [] })
    );
    expect(branch.latestStatus).toBe("unknown");
  });
});

describe("checkActions", () => {
  const tags: Record<string, Map<string, string[]>> = {
    "actions/checkout": new Map([[SHA, ["v5", "v5.1.0"]]]),
    "oven-sh/setup-bun": new Map(),
    "pnpm/action-setup": new Map([[OTHER_SHA, ["v6.0.10"]]]),
  };
  const calls: string[] = [];
  const repository = {
    commitDate: (repo: string, sha: string) => {
      calls.push(`date ${repo}@${sha}`);
      return Promise.resolve(sha === SHA ? "2026-07-16" : undefined);
    },
    latestRelease: (repo: string) => {
      calls.push(`latest ${repo}`);
      return Promise.resolve(
        repo === "actions/checkout" ? "v7.0.1" : undefined
      );
    },
    tagsByCommit: (repo: string) => {
      calls.push(`tags ${repo}`);
      return tags[repo] ?? new Map();
    },
  };

  it("judges one row per repo@ref, looking each repository up once and each SHA once", async () => {
    calls.length = 0;
    const rows = await checkActions(
      [
        pin(),
        pin({ file: "release.yml", line: 2 }),
        pin({ comment: "v6.0.10", ref: OTHER_SHA, repo: "pnpm/action-setup" }),
        pin({ comment: undefined, ref: "v2", repo: "oven-sh/setup-bun" }),
      ],
      repository
    );
    expect(
      rows.map((row) => [
        row.repo,
        row.status,
        row.facts.latest,
        row.latestStatus,
      ])
    ).toEqual([
      ["actions/checkout", "ok", "v7.0.1", "newer"],
      ["pnpm/action-setup", "ok", "v6.0.10", "current"],
      ["oven-sh/setup-bun", "unpinned", undefined, "unknown"],
    ]);
    expect(rows[0]?.pins).toHaveLength(2);
    expect(calls.filter((call) => call.startsWith("tags "))).toEqual([
      "tags actions/checkout",
      "tags pnpm/action-setup",
      "tags oven-sh/setup-bun",
    ]);
    expect(calls.filter((call) => call.startsWith("date "))).toEqual([
      `date actions/checkout@${SHA}`,
      `date pnpm/action-setup@${OTHER_SHA}`,
    ]);
  });

  it("falls back to the highest version tag when a repository has no release", async () => {
    const [row] = await checkActions(
      [pin({ comment: "v6.0.10", ref: OTHER_SHA, repo: "pnpm/action-setup" })],
      repository
    );
    expect(row?.facts.latest).toBe("v6.0.10");
  });

  it("rejects when a lookup rejects", async () => {
    const failing = {
      ...repository,
      latestRelease: () => Promise.reject(new Error("GitHub API 403")),
    };
    await expect(checkActions([pin()], failing)).rejects.toThrow(
      "GitHub API 403"
    );
  });
});

describe("failures", () => {
  it("names every offending reference by file and line", () => {
    const ok = judge([pin()], facts());
    const mismatch = judge(
      [
        pin({ comment: "v9", line: 4 }),
        pin({ comment: "v9", file: "b.yml", line: 2 }),
      ],
      facts()
    );
    const missing = judge(
      [pin({ file: "c.yml", line: 7 })],
      facts({ date: undefined, tags: [] })
    );
    const unpinned = judge(
      [pin({ comment: undefined, file: "d.yml", line: 3, ref: "v5" })],
      facts({ tags: [] })
    );
    expect(failures([ok])).toEqual([]);
    expect(failures([mismatch, missing, unpinned])).toEqual([
      `ci.yml:4 actions/checkout@${SHA} comment "v9" is not a tag at this SHA (tags: v5, v5.1.0)`,
      `b.yml:2 actions/checkout@${SHA} comment "v9" is not a tag at this SHA (tags: v5, v5.1.0)`,
      `c.yml:7 actions/checkout@${SHA} has no tag pointing at it (commit not found)`,
      "d.yml:3 actions/checkout@v5 is not pinned to a full commit SHA",
    ]);
  });
});

describe("formatTable", () => {
  it("renders one aligned row per group with a short SHA", () => {
    const row = judge(
      [pin(), pin({ file: "release.yml", line: 2 })],
      facts({ latest: "v7.0.1" })
    );
    const [header = "", line = ""] = formatTable([row]).split("\n");
    expect(header).toMatch(
      /^Action\s+Pinned\s+Comment\s+Tags at SHA\s+Status\s+Committed\s+Latest\s+Where$/
    );
    expect(line.replaceAll(/\s+/g, " ")).toBe(
      "actions/checkout fbc6f39 v5.1.0 v5, v5.1.0 ok 2026-07-16 v7.0.1 (newer) ci.yml, release.yml"
    );
  });
});
