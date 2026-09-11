# create-glion

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
