# @glion/transform-segment-terminator

## 0.32.0

### Minor Changes

- [#1148](https://github.com/rethinkhealth/glion/pull/1148) [`783eda5`](https://github.com/rethinkhealth/glion/commit/783eda533ea9d9b39df95d7dbfcd60495a4beb00) Thanks [@meleksomai](https://github.com/meleksomai)! - New plugin: `@glion/transform-segment-terminator` sets the `terminator` of every segment, segments inside groups included, to `\r`, the segment terminator HL7v2 requires, whatever line break it was read with. It changes the tree in place.

### Patch Changes

- Updated dependencies [[`1149745`](https://github.com/rethinkhealth/glion/commit/114974584f3e71e4c3ffcf3014a7d4e815be57b7), [`783eda5`](https://github.com/rethinkhealth/glion/commit/783eda533ea9d9b39df95d7dbfcd60495a4beb00)]:
  - @glion/ast@0.32.0
  - @glion/utils@0.32.0
  - @glion/util-visit@0.32.0
