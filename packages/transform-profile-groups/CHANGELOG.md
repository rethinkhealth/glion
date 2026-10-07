# @glion/transform-profile-groups

## 0.21.0

### Minor Changes

- [#873](https://github.com/rethinkhealth/glion/pull/873) [`bf06ee4`](https://github.com/rethinkhealth/glion/commit/bf06ee4d3f64e10fafe0bceab3ba9ac3f297e1e6) Thanks [@meleksomai](https://github.com/meleksomai)! - New package: a unified plugin that nests a message's segments in the segment groups its event schema defines, such as `PATIENT_RESULT` and `ORDER_OBSERVATION`. It groups by the schema MSH-12 and MSH-9 name, or by the `definition` option: an `EventSchema`, or a function of `{ tree, file }` that returns one. It moves the existing segment nodes without copying them, and leaves the tree flat when the segments do not fit the schema. A Z-segment the schema does not name goes right after the segment before it, in that segment's group; set `allowZSegments: false` to leave such a message flat.

### Patch Changes

- Updated dependencies [[`38928ab`](https://github.com/rethinkhealth/glion/commit/38928ab64b253669ad399001e00aaf1ba4575ca9), [`2eb9b4b`](https://github.com/rethinkhealth/glion/commit/2eb9b4b12ec6acafff0d13386cc6787402191c74), [`38928ab`](https://github.com/rethinkhealth/glion/commit/38928ab64b253669ad399001e00aaf1ba4575ca9), [`38928ab`](https://github.com/rethinkhealth/glion/commit/38928ab64b253669ad399001e00aaf1ba4575ca9), [`07d09ec`](https://github.com/rethinkhealth/glion/commit/07d09ec2c35cfce7dd145a2232ea079600dbd791), [`b44a96c`](https://github.com/rethinkhealth/glion/commit/b44a96c7de072383e0fea57b016dd9ec108f73aa), [`8ac4236`](https://github.com/rethinkhealth/glion/commit/8ac42365f7c887db980f9da98bbde4f5286593bb), [`b44a96c`](https://github.com/rethinkhealth/glion/commit/b44a96c7de072383e0fea57b016dd9ec108f73aa), [`e38396e`](https://github.com/rethinkhealth/glion/commit/e38396e9962e203986aa27fc205c3f5bf992d153)]:
  - @glion/profiles@0.21.0
  - @glion/util-query@0.21.0
  - @glion/ast@0.21.0
  - @glion/util-visit@0.21.0
