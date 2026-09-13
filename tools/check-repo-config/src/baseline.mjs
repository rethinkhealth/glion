/**
 * @module @glion/check-repo-config/baseline
 * @file Projects live GitHub API objects onto the fields the baseline
 *   records, and diffs a baseline against a projection. No network access.
 */

/**
 * A single difference between a baseline and the live projection.
 *
 * @typedef {object} Difference
 * @property {string} path Dot path to the differing value; `[i]` for array
 *   indexes.
 * @property {unknown} expected The baseline value, or `undefined` when the path
 *   is absent from the baseline.
 * @property {unknown} actual The live value, or `undefined` when the path is
 *   absent live.
 */

const byKey = (key) => (a, b) => String(a[key]).localeCompare(String(b[key]));
const byString = (a, b) => String(a).localeCompare(String(b));

/**
 * The baseline projection of a repository ruleset.
 *
 * Keeps `name`, `target`, `enforcement`, `conditions`, `bypass_actors`,
 * and `rules`. Rules are sorted by `type`; required status checks by
 * `context`; code scanning tools by `tool`.
 *
 * @param {Record<string, any>} ruleset A ruleset as returned by `GET
 *   /repos/{owner}/{repo}/rulesets/{id}`.
 * @returns {Record<string, unknown>} The projection.
 */
export function projectRuleset(ruleset) {
  const rules = ruleset.rules.map((rule) => {
    const parameters = rule.parameters ? { ...rule.parameters } : undefined;
    if (parameters?.required_status_checks) {
      parameters.required_status_checks = [
        ...parameters.required_status_checks,
      ].toSorted(byKey("context"));
    }
    if (parameters?.code_scanning_tools) {
      parameters.code_scanning_tools = [
        ...parameters.code_scanning_tools,
      ].toSorted(byKey("tool"));
    }
    return parameters ? { parameters, type: rule.type } : { type: rule.type };
  });
  return {
    bypass_actors: ruleset.bypass_actors,
    conditions: ruleset.conditions,
    enforcement: ruleset.enforcement,
    name: ruleset.name,
    rules: rules.toSorted(byKey("type")),
    target: ruleset.target,
  };
}

/**
 * The baseline projection of the repository settings.
 *
 * `security_and_analysis` is flattened to `{ feature: status }`.
 *
 * @param {Record<string, any>} repository The object from `GET
 *   /repos/{owner}/{repo}`.
 * @param {{ enabled: boolean }} privateVulnerabilityReporting The object from
 *   `GET /repos/{owner}/{repo}/private-vulnerability-reporting`.
 * @returns {Record<string, unknown>} The projection.
 */
export function projectRepository(repository, privateVulnerabilityReporting) {
  const security = {};
  for (const [feature, value] of Object.entries(
    repository.security_and_analysis ?? {}
  )) {
    security[feature] = value.status;
  }
  return {
    allow_auto_merge: repository.allow_auto_merge,
    allow_forking: repository.allow_forking,
    allow_merge_commit: repository.allow_merge_commit,
    allow_rebase_merge: repository.allow_rebase_merge,
    allow_squash_merge: repository.allow_squash_merge,
    allow_update_branch: repository.allow_update_branch,
    default_branch: repository.default_branch,
    delete_branch_on_merge: repository.delete_branch_on_merge,
    has_discussions: repository.has_discussions,
    has_projects: repository.has_projects,
    has_wiki: repository.has_wiki,
    private_vulnerability_reporting: privateVulnerabilityReporting.enabled,
    security_and_analysis: security,
    visibility: repository.visibility,
    web_commit_signoff_required: repository.web_commit_signoff_required,
  };
}

/**
 * The baseline projection of the Actions settings, merged from the
 * permissions and workflow-permissions endpoints.
 *
 * @param {Record<string, any>} permissions The object from `GET
 *   /repos/{owner}/{repo}/actions/permissions`.
 * @param {Record<string, any>} workflow The object from `GET
 *   /repos/{owner}/{repo}/actions/permissions/workflow`.
 * @returns {Record<string, unknown>} The projection.
 */
export function projectActions(permissions, workflow) {
  return {
    allowed_actions: permissions.allowed_actions,
    can_approve_pull_request_reviews: workflow.can_approve_pull_request_reviews,
    default_workflow_permissions: workflow.default_workflow_permissions,
    enabled: permissions.enabled,
    sha_pinning_required: permissions.sha_pinning_required,
  };
}

/**
 * The baseline projection of the environments: name and protection rule
 * types, sorted by name.
 *
 * @param {{ environments: Record<string, any>[] }} listing The object from `GET
 *   /repos/{owner}/{repo}/environments`.
 * @returns {{ name: string; protection_rules: string[] }[]} The projection.
 */
export function projectEnvironments(listing) {
  return listing.environments
    .map((environment) => ({
      name: environment.name,
      protection_rules: (environment.protection_rules ?? [])
        .map((rule) => rule.type)
        .toSorted(byString),
    }))
    .toSorted(byKey("name"));
}

/**
 * The baseline projection of the code scanning default setup.
 *
 * @param {Record<string, any>} setup The object from `GET
 *   /repos/{owner}/{repo}/code-scanning/default-setup`.
 * @returns {Record<string, unknown>} The projection.
 */
export function projectCodeScanning(setup) {
  return {
    languages: [...(setup.languages ?? [])].toSorted(byString),
    query_suite: setup.query_suite,
    schedule: setup.schedule,
    state: setup.state,
    threat_model: setup.threat_model,
  };
}

const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Every leaf that differs between `expected` and `actual`, in key order.
 *
 * Arrays are compared element by element; a length difference reports the
 * surplus elements individually.
 *
 * @param {unknown} expected The baseline value.
 * @param {unknown} actual The live projection.
 * @param {string} [path] Prefix for reported paths.
 * @returns {Difference[]} Empty when the values are deeply equal.
 */
export function diff(expected, actual, path = "") {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const length = Math.max(expected.length, actual.length);
    return Array.from({ length }, (_, index) =>
      diff(expected[index], actual[index], `${path}[${index}]`)
    ).flat();
  }
  if (isObject(expected) && isObject(actual)) {
    const keys = [
      ...new Set([...Object.keys(expected), ...Object.keys(actual)]),
    ].toSorted(byString);
    return keys.flatMap((key) =>
      diff(expected[key], actual[key], path ? `${path}.${key}` : key)
    );
  }
  return Object.is(expected, actual) ? [] : [{ actual, expected, path }];
}

/**
 * `value` serialised as indented JSON with object keys sorted at every
 * level and a trailing newline.
 *
 * @param {unknown} value Any JSON-serialisable value.
 * @returns {string} The text written to a baseline file.
 */
export function stable(value) {
  const sortKeys = (input) => {
    if (Array.isArray(input)) {
      return input.map(sortKeys);
    }
    if (isObject(input)) {
      return Object.fromEntries(
        Object.keys(input)
          .toSorted(byString)
          .map((key) => [key, sortKeys(input[key])])
      );
    }
    return input;
  };
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}
