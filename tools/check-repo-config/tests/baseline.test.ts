import { describe, expect, it } from "vitest";

import {
  diff,
  projectActions,
  projectCodeScanning,
  projectEnvironments,
  projectRepository,
  projectRuleset,
  stable,
} from "../src/baseline.mjs";

describe("projectRuleset", () => {
  it("keeps the reviewed fields, drops ids and links, and sorts rules, checks, and tools", () => {
    const projection = projectRuleset({
      _links: { self: { href: "x" } },
      bypass_actors: [],
      conditions: { ref_name: { exclude: [], include: ["~DEFAULT_BRANCH"] } },
      created_at: "2026-05-02",
      current_user_can_bypass: "never",
      enforcement: "active",
      id: 15_871_978,
      name: "default",
      node_id: "RRS_x",
      rules: [
        {
          parameters: {
            code_scanning_tools: [{ tool: "zizmor" }, { tool: "CodeQL" }],
          },
          type: "code_scanning",
        },
        {
          parameters: {
            required_status_checks: [
              { context: "linting" },
              { context: "Type checking" },
            ],
            strict_required_status_checks_policy: true,
          },
          type: "required_status_checks",
        },
        { type: "deletion" },
      ],
      target: "branch",
      updated_at: "2026-09-13",
    });
    expect(Object.keys(projection).toSorted()).toEqual([
      "bypass_actors",
      "conditions",
      "enforcement",
      "name",
      "rules",
      "target",
    ]);
    expect(projection.rules).toEqual([
      {
        parameters: {
          code_scanning_tools: [{ tool: "CodeQL" }, { tool: "zizmor" }],
        },
        type: "code_scanning",
      },
      { type: "deletion" },
      {
        parameters: {
          required_status_checks: [
            { context: "linting" },
            { context: "Type checking" },
          ],
          strict_required_status_checks_policy: true,
        },
        type: "required_status_checks",
      },
    ]);
  });
});

describe("projectRepository", () => {
  it("flattens security_and_analysis to statuses and folds in private vulnerability reporting", () => {
    const projection = projectRepository(
      {
        allow_auto_merge: true,
        allow_forking: true,
        allow_merge_commit: false,
        allow_rebase_merge: false,
        allow_squash_merge: true,
        allow_update_branch: true,
        default_branch: "main",
        delete_branch_on_merge: true,
        has_discussions: false,
        has_projects: true,
        has_wiki: false,
        pushed_at: "2026-09-13",
        security_and_analysis: {
          secret_scanning: { status: "enabled" },
          secret_scanning_ai_detection: { status: "disabled" },
        },
        stargazers_count: 12,
        visibility: "public",
        web_commit_signoff_required: false,
      },
      { enabled: true }
    );
    expect(projection).toEqual({
      allow_auto_merge: true,
      allow_forking: true,
      allow_merge_commit: false,
      allow_rebase_merge: false,
      allow_squash_merge: true,
      allow_update_branch: true,
      default_branch: "main",
      delete_branch_on_merge: true,
      has_discussions: false,
      has_projects: true,
      has_wiki: false,
      private_vulnerability_reporting: true,
      security_and_analysis: {
        secret_scanning: "enabled",
        secret_scanning_ai_detection: "disabled",
      },
      visibility: "public",
      web_commit_signoff_required: false,
    });
  });
});

describe("projectActions", () => {
  it("merges the permissions and workflow endpoints", () => {
    expect(
      projectActions(
        { allowed_actions: "all", enabled: true, sha_pinning_required: true },
        {
          can_approve_pull_request_reviews: false,
          default_workflow_permissions: "read",
        }
      )
    ).toEqual({
      allowed_actions: "all",
      can_approve_pull_request_reviews: false,
      default_workflow_permissions: "read",
      enabled: true,
      sha_pinning_required: true,
    });
  });
});

describe("projectEnvironments", () => {
  it("records names and protection rule types, sorted", () => {
    expect(
      projectEnvironments({
        environments: [
          {
            id: 2,
            name: "production",
            protection_rules: [
              { type: "wait_timer" },
              { type: "required_reviewers" },
            ],
          },
          { id: 1, name: "copilot", protection_rules: [] },
        ],
      })
    ).toEqual([
      { name: "copilot", protection_rules: [] },
      {
        name: "production",
        protection_rules: ["required_reviewers", "wait_timer"],
      },
    ]);
    expect(projectEnvironments({ environments: [] })).toEqual([]);
  });
});

describe("projectCodeScanning", () => {
  it("keeps the setup fields with languages sorted", () => {
    expect(
      projectCodeScanning({
        languages: ["typescript", "actions"],
        query_suite: "default",
        runner_type: "standard",
        schedule: "weekly",
        state: "configured",
        threat_model: "remote",
        updated_at: "2026-08-28",
      })
    ).toEqual({
      languages: ["actions", "typescript"],
      query_suite: "default",
      schedule: "weekly",
      state: "configured",
      threat_model: "remote",
    });
  });
});

describe("diff", () => {
  it("is empty for deeply equal values", () => {
    expect(diff({ a: [1, { b: "x" }] }, { a: [1, { b: "x" }] })).toEqual([]);
  });

  it("reports each differing leaf with its path", () => {
    expect(
      diff(
        {
          actions: { sha_pinning_required: true },
          rules: [{ type: "deletion" }, { type: "pull_request" }],
        },
        {
          actions: { sha_pinning_required: false },
          rules: [{ type: "deletion" }],
        }
      )
    ).toEqual([
      { actual: false, expected: true, path: "actions.sha_pinning_required" },
      {
        actual: undefined,
        expected: { type: "pull_request" },
        path: "rules[1]",
      },
    ]);
  });

  it("reports keys present on only one side", () => {
    expect(diff({ a: 1 }, { a: 1, b: 2 })).toEqual([
      { actual: 2, expected: undefined, path: "b" },
    ]);
  });
});

describe("stable", () => {
  it("sorts object keys at every level and ends with a newline", () => {
    expect(stable({ a: null, b: [{ y: 2, z: 1 }] })).toBe(
      '{\n  "a": null,\n  "b": [\n    {\n      "y": 2,\n      "z": 1\n    }\n  ]\n}\n'
    );
  });
});
