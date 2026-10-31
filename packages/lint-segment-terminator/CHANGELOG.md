# @glion/lint-segment-terminator

## 0.32.0

### Minor Changes

- [#1148](https://github.com/rethinkhealth/glion/pull/1148) [`783eda5`](https://github.com/rethinkhealth/glion/commit/783eda533ea9d9b39df95d7dbfcd60495a4beb00) Thanks [@meleksomai](https://github.com/meleksomai)! - New lint rule: `@glion/lint-segment-terminator` reports a segment that ends with a line feed, or with a carriage return and a line feed, and a last segment with no segment terminator, from the `terminator` `@glion/parser` records on each segment. HL7v2 ends every segment with a carriage return, the last one included. `@glion/preset-lint-recommended` runs it, at its default severity, `warning`.

### Patch Changes

- Updated dependencies []:
  - @glion/util-visit@0.32.0
