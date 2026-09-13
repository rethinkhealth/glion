# Repository configuration baseline

The reviewed configuration of `rethinkhealth/glion` on GitHub, as the `repo-config-audit` workflow expects to find it every Monday and on demand. Each file is the projection `@glion/check-repo-config` takes of one API object; fields GitHub changes on its own (ids, timestamps, links) are not recorded.

| File                 | Source                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `ruleset-main.json`  | the `default` ruleset on `main`: rules, conditions, bypass actors                          |
| `repository.json`    | merge and branch settings, security and analysis features, private vulnerability reporting |
| `actions.json`       | allowed actions, SHA pinning, default workflow token permissions                           |
| `environments.json`  | environment names and protection rule types                                                |
| `code-scanning.json` | CodeQL default setup                                                                       |

`pnpm check:repo-config` diffs the live configuration against these files. A settings change is a pull request that updates them: change the setting, run `pnpm check:repo-config --update`, and open the PR with the diff. Drift found by the audit is filed as an issue labelled `security`.
