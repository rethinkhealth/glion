# @glion/annotate-profile-tables

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @glion/annotate-profile-context@0.31.0
  - @glion/annotate-profile-datatypes@0.31.0
  - @glion/ast@0.31.0
  - @glion/util-visit@0.31.0

## 0.30.0

### Patch Changes

- Updated dependencies []:
  - @glion/util-visit@0.30.0
  - @glion/annotate-profile-context@0.30.0
  - @glion/annotate-profile-datatypes@0.30.0
  - @glion/ast@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies []:
  - @glion/annotate-profile-datatypes@0.29.0
  - @glion/util-visit@0.29.0
  - @glion/annotate-profile-context@0.29.0
  - @glion/ast@0.29.0

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @glion/util-visit@0.28.0
  - @glion/annotate-profile-datatypes@0.28.0
  - @glion/annotate-profile-context@0.28.0
  - @glion/ast@0.28.0

## 0.27.1

### Patch Changes

- Updated dependencies [[`0e0383e`](https://github.com/rethinkhealth/glion/commit/0e0383e86df9e189aeea76c7d468fd7812230cb0)]:
  - @glion/util-visit@0.27.1
  - @glion/annotate-profile-context@0.27.1
  - @glion/annotate-profile-datatypes@0.27.1
  - @glion/ast@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies [[`cb4c228`](https://github.com/rethinkhealth/glion/commit/cb4c2284ffe7925108a3ea7b9f5bd1b3ec39641e), [`dd82064`](https://github.com/rethinkhealth/glion/commit/dd82064b0b388051ca25852afda01527ddade891)]:
  - @glion/annotate-profile-datatypes@0.27.0
  - @glion/util-visit@0.27.0
  - @glion/annotate-profile-context@0.27.0
  - @glion/ast@0.27.0

## 0.26.0

### Patch Changes

- Updated dependencies []:
  - @glion/annotate-profile-context@0.26.0
  - @glion/annotate-profile-datatypes@0.26.0
  - @glion/ast@0.26.0
  - @glion/util-visit@0.26.0

## 0.25.0

### Minor Changes

- [#940](https://github.com/rethinkhealth/glion/pull/940) [`ddc5c76`](https://github.com/rethinkhealth/glion/commit/ddc5c769720e9ef6689c53baa6b379d4c8525283) Thanks [@meleksomai](https://github.com/meleksomai)! - `@glion/annotate-profile-tables` annotates each primitive value bound to a table (a field repetition, component, or subcomponent whose `data.kind` is `"primitive"` and whose `data.table` is set) with the entry of that table its value matches, as `node.data.tableValue = { value, description }`, read from the table printed in the HL7v2 version the message declares in MSH-12. A v2.5 PID-30 valued `N` is annotated `{ value: "N", description: "No" }` ([#935](https://github.com/rethinkhealth/glion/issues/935)); a v2.3 PID-8 valued `A` is not, since table 0001 defines `A` from v2.4. Composite values, such as a CWE field, are not annotated.

### Patch Changes

- Updated dependencies [[`ddc5c76`](https://github.com/rethinkhealth/glion/commit/ddc5c769720e9ef6689c53baa6b379d4c8525283), [`ddc5c76`](https://github.com/rethinkhealth/glion/commit/ddc5c769720e9ef6689c53baa6b379d4c8525283)]:
  - @glion/annotate-profile-context@0.25.0
  - @glion/annotate-profile-datatypes@0.25.0
  - @glion/ast@0.25.0
  - @glion/util-visit@0.25.0
