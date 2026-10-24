# @glion/transform-profile-groups

## 0.30.0

### Patch Changes

- Updated dependencies []:
  - @glion/util-query@0.30.0
  - @glion/util-visit@0.30.0
  - @glion/ast@0.30.0
  - @glion/profiles@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies []:
  - @glion/profiles@0.29.0
  - @glion/util-query@0.29.0
  - @glion/util-visit@0.29.0
  - @glion/ast@0.29.0

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @glion/util-query@0.28.0
  - @glion/util-visit@0.28.0
  - @glion/profiles@0.28.0
  - @glion/ast@0.28.0

## 0.27.1

### Patch Changes

- Updated dependencies [[`0e0383e`](https://github.com/rethinkhealth/glion/commit/0e0383e86df9e189aeea76c7d468fd7812230cb0), [`0e0383e`](https://github.com/rethinkhealth/glion/commit/0e0383e86df9e189aeea76c7d468fd7812230cb0)]:
  - @glion/profiles@0.27.1
  - @glion/util-visit@0.27.1
  - @glion/ast@0.27.1
  - @glion/util-query@0.27.1

## 0.27.0

### Patch Changes

- [#972](https://github.com/rethinkhealth/glion/pull/972) [`58c6ab6`](https://github.com/rethinkhealth/glion/commit/58c6ab6b4052d68c3361a9aa56c4057f7b034728) Thanks [@meleksomai](https://github.com/meleksomai)! - The README shows paths that name every group from the message down, as `@glion/util-query` now requires: `PATIENT_RESULT.ORDER_OBSERVATION[1].OBSERVATION[2].OBX.5`.
- Updated dependencies [[`7c24dbc`](https://github.com/rethinkhealth/glion/commit/7c24dbce0ae8ce90b04e69f5c4d6da290ba43650), [`d702f6a`](https://github.com/rethinkhealth/glion/commit/d702f6a31ff95af55b3850e18d1d3f13f3accce7), [`799a57c`](https://github.com/rethinkhealth/glion/commit/799a57c8dd6bab65c3c655cef2515be4c0eb45d0), [`3dfa36e`](https://github.com/rethinkhealth/glion/commit/3dfa36e5ba03ad7bfe4ce037cc1bd12c53d42a1d), [`ac05055`](https://github.com/rethinkhealth/glion/commit/ac05055ab3348054d3c98429e53e7c105a82c02f), [`58c6ab6`](https://github.com/rethinkhealth/glion/commit/58c6ab6b4052d68c3361a9aa56c4057f7b034728), [`34d8e21`](https://github.com/rethinkhealth/glion/commit/34d8e217a9655cee2fdf42202ed58168c3ed72ed), [`dd82064`](https://github.com/rethinkhealth/glion/commit/dd82064b0b388051ca25852afda01527ddade891)]:
  - @glion/profiles@0.27.0
  - @glion/util-query@0.27.0
  - @glion/util-visit@0.27.0
  - @glion/ast@0.27.0

## 0.26.0

### Patch Changes

- Updated dependencies []:
  - @glion/ast@0.26.0
  - @glion/profiles@0.26.0
  - @glion/util-query@0.26.0
  - @glion/util-visit@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [[`ddc5c76`](https://github.com/rethinkhealth/glion/commit/ddc5c769720e9ef6689c53baa6b379d4c8525283)]:
  - @glion/profiles@0.25.0
  - @glion/ast@0.25.0
  - @glion/util-query@0.25.0
  - @glion/util-visit@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies [[`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68), [`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68), [`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68), [`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68), [`e21c0a0`](https://github.com/rethinkhealth/glion/commit/e21c0a0e51db47f36e42926d9ec5a7a5f730b4d8)]:
  - @glion/profiles@0.24.0
  - @glion/util-query@0.24.0
  - @glion/util-visit@0.24.0
  - @glion/ast@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [[`a8aec03`](https://github.com/rethinkhealth/glion/commit/a8aec03333d5b24570145043ff4d2c99a5dde28b)]:
  - @glion/util-visit@0.23.0
  - @glion/ast@0.23.0
  - @glion/profiles@0.23.0
  - @glion/util-query@0.23.0

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
