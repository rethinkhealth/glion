# create-glion

## 0.31.0

No changes in this release.

## 0.30.0

### Minor Changes

- [#1085](https://github.com/rethinkhealth/glion/pull/1085) [`7d33e02`](https://github.com/rethinkhealth/glion/commit/7d33e02a8f727635cce106b2ff5daab0cf1c9606) Thanks [@meleksomai](https://github.com/meleksomai)! - Breaking: `--example` without a value no longer opens a picker. It takes the name of a directory in `examples/`, or the URL of a GitHub repository or a directory in one, like `create-next-app`, and an empty value is refused. `--example-path` names the directory when a branch name contains a slash. The template is downloaded into a temporary directory, and nothing is written to the target directory unless the template has a `package.json`.

## 0.29.0

No changes in this release.

## 0.28.0

No changes in this release.

## 0.27.1

No changes in this release.

## 0.27.0

### Patch Changes

- [#954](https://github.com/rethinkhealth/glion/pull/954) [`f3d04ba`](https://github.com/rethinkhealth/glion/commit/f3d04bab8eafc416993a86abfe5c5331e316d901) Thanks [@meleksomai](https://github.com/meleksomai)! - Update `giget` to 3.2.0, which has no dependencies and bundles `tar` 7 with its security fixes.

## 0.26.0

No changes in this release.

## 0.25.0

No changes in this release.

## 0.2.0

### Minor Changes

- dca5259: **BREAKING:** Raise `engines.node` from `>=20` to `>=22` across all `@glion/*` packages and `create-glion`, and drop Node 20.x from the CI test matrix (#728).

  Node 20 reached end-of-life on 2026-04-30 and is no longer tested. The supported and tested runtimes are Node 22 and Node 24.

  Downstream impact: applications that pin Node 20 will need to upgrade to Node 22 or later. Node 22 is in Maintenance LTS until April 2027; Node 24 is the current Active LTS and the recommended target.

## 0.1.0

### Minor Changes

- 3e38721: Add `starter` template and skip the example-select prompt by default so a fresh interactive run only asks for the project directory.
  - Add `starter` example (minimal MLLP server: one `ADT^A01` route with `ackMiddleware()`, plus a catch-all reject)
  - Use `starter` silently when `--example` is omitted; the interactive picker now only opens when the flag is passed without a value (e.g. `create-glion --example`)
  - Default the directory prompt to `./my-glion-app` via `defaultValue`; pressing enter is no longer rejected as empty input
