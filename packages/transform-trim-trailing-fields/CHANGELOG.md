# @glion/transform-trim-trailing-fields

## 0.30.0

### Minor Changes

- [#1094](https://github.com/rethinkhealth/glion/pull/1094) [`a5306ed`](https://github.com/rethinkhealth/glion/commit/a5306ed462ca167f606c6c0a9d110ae322a34116) Thanks [@meleksomai](https://github.com/meleksomai)! - Add `@glion/transform-trim-trailing-fields`, a transform that removes the empty fields at the end of each segment, so `PID|1|DOE||` is written as `PID|1|DOE`.

  - Treat a field as empty when none of its components, repetitions, or subcomponents holds a value, as HL7v2 treats it as not present: a trailing `|^^|` or `|~|` is removed, and a trailing `|""|`, the null value, stays.
  - Keep the field separator after a segment's last field with a value when `keepTrailingField` is `true`, so `PID|1|DOE||` is written as `PID|1|DOE|`.

### Patch Changes

- Updated dependencies []:
  - @glion/util-visit@0.30.0
  - @glion/ast@0.30.0
  - @glion/utils@0.30.0
