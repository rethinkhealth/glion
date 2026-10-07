# @glion/transform-profile-groups

## 0.22.0

### Minor Changes

- [#886](https://github.com/rethinkhealth/glion/pull/886) [`93dbb80`](https://github.com/rethinkhealth/glion/commit/93dbb8053acfdf46f72dba2932950cf260e75ab7) Thanks [@meleksomai](https://github.com/meleksomai)! - A segment group carries an `id` and a `name`. The `id`, such as `PATIENT_VISIT`, holds only uppercase letters, digits, and `_`, and is what a path names the group by. The `name` is the group name for display, in title case with abbreviations spelled out, such as `Patient Visit` or `Master File Test Battery Detail`.

  The bundled event schemas replace the group IDs the HL7 XML schemas invent for groups some versions leave unnamed, such as `PIDNTE_SUPPGRP` in v2.5.1 `ORF_R04`, with the ID the nearest version gives the same segments (`PATIENT`), and spell `TIIMING`, `RSPONSE`, and `DEFINTION` as `TIMING`, `RESPONSE`, and `DEFINITION`. Paths that named those IDs change with them.

  **Breaking:** the event schema JSON Schema's `$id`, which every bundled schema names in `$schema`, is `https://glion.dev/schemas/event-schema/v2.json`. A `group` element of an event schema requires `id` as well as `name`, and the JSON Schema requires the `[A-Z][A-Z0-9_]*` pattern of the `id`, not the `name`. `runner` throws for a group with no ID. `GroupMatch` and the AST `Group` carry `id` and `name`, and `@glion/transform-profile-groups` sets both. `@glion/util-query` matches a group in a path by its `id`, and `format` writes the `id`. `@glion/jsonify` writes a group's `id` in `group` and adds its `name`. `@glion/builder`'s `g()` takes a string, used as both the ID and the name, or `{ id, name }`.

### Patch Changes

- Updated dependencies [[`93dbb80`](https://github.com/rethinkhealth/glion/commit/93dbb8053acfdf46f72dba2932950cf260e75ab7)]:
  - @glion/ast@0.22.0
  - @glion/profiles@0.22.0
  - @glion/util-query@0.22.0
  - @glion/util-visit@0.22.0

## 0.21.0

### Minor Changes

- [#873](https://github.com/rethinkhealth/glion/pull/873) [`bf06ee4`](https://github.com/rethinkhealth/glion/commit/bf06ee4d3f64e10fafe0bceab3ba9ac3f297e1e6) Thanks [@meleksomai](https://github.com/meleksomai)! - New package: a unified plugin that nests a message's segments in the segment groups its event schema defines, such as `PATIENT_RESULT` and `ORDER_OBSERVATION`. It groups by the schema MSH-12 and MSH-9 name, or by the `definition` option: an `EventSchema`, or a function of `{ tree, file }` that returns one. It moves the existing segment nodes without copying them, and leaves the tree flat when the segments do not fit the schema. A Z-segment the schema does not name goes right after the segment before it, in that segment's group; set `allowZSegments: false` to leave such a message flat.

### Patch Changes

- Updated dependencies [[`38928ab`](https://github.com/rethinkhealth/glion/commit/38928ab64b253669ad399001e00aaf1ba4575ca9), [`2eb9b4b`](https://github.com/rethinkhealth/glion/commit/2eb9b4b12ec6acafff0d13386cc6787402191c74), [`38928ab`](https://github.com/rethinkhealth/glion/commit/38928ab64b253669ad399001e00aaf1ba4575ca9), [`38928ab`](https://github.com/rethinkhealth/glion/commit/38928ab64b253669ad399001e00aaf1ba4575ca9), [`07d09ec`](https://github.com/rethinkhealth/glion/commit/07d09ec2c35cfce7dd145a2232ea079600dbd791), [`b44a96c`](https://github.com/rethinkhealth/glion/commit/b44a96c7de072383e0fea57b016dd9ec108f73aa), [`8ac4236`](https://github.com/rethinkhealth/glion/commit/8ac42365f7c887db980f9da98bbde4f5286593bb), [`b44a96c`](https://github.com/rethinkhealth/glion/commit/b44a96c7de072383e0fea57b016dd9ec108f73aa), [`e38396e`](https://github.com/rethinkhealth/glion/commit/e38396e9962e203986aa27fc205c3f5bf992d153)]:
  - @glion/profiles@0.21.0
  - @glion/util-query@0.21.0
  - @glion/ast@0.21.0
  - @glion/util-visit@0.21.0
