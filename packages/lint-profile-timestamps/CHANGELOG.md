# @glion/lint-profile-timestamps

## 0.30.0

### Patch Changes

- Updated dependencies []:
  - @glion/util-visit@0.30.0
  - @glion/annotate-profile-datatypes@0.30.0
  - @glion/ast@0.30.0
  - @glion/util-timestamp@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies []:
  - @glion/annotate-profile-datatypes@0.29.0
  - @glion/util-visit@0.29.0
  - @glion/ast@0.29.0
  - @glion/util-timestamp@0.29.0

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @glion/util-visit@0.28.0
  - @glion/annotate-profile-datatypes@0.28.0
  - @glion/ast@0.28.0
  - @glion/util-timestamp@0.28.0

## 0.27.1

### Patch Changes

- Updated dependencies [[`0e0383e`](https://github.com/rethinkhealth/glion/commit/0e0383e86df9e189aeea76c7d468fd7812230cb0)]:
  - @glion/util-visit@0.27.1
  - @glion/annotate-profile-datatypes@0.27.1
  - @glion/ast@0.27.1
  - @glion/util-timestamp@0.27.1

## 0.27.0

### Minor Changes

- [#977](https://github.com/rethinkhealth/glion/pull/977) [`7470329`](https://github.com/rethinkhealth/glion/commit/747032939dec8b334465c63ce654aaf460b20830) Thanks [@meleksomai](https://github.com/meleksomai)! - New lint rule: reports a DT, TM, or DTM value, and TS.1 in every version, that does not follow its datatype's format or names a month, day, hour, minute, second, or offset that does not exist, such as `20250229`.

### Patch Changes

- [#987](https://github.com/rethinkhealth/glion/pull/987) [`4a8da16`](https://github.com/rethinkhealth/glion/commit/4a8da1634fa33ed941699a6f9fbe88950af0983d) Thanks [@meleksomai](https://github.com/meleksomai)! - Lint findings describe the node they are placed on, never name it, and never contain content from the message (ADR 0030). ``Field `PID-5` (Patient Name) is 300 characters long; it allows at most 250.`` is now `The value is 300 characters long; the field allows at most 250.` The finding's `place` and `ancestors` locate the node, and `actual` carries the content. Findings about a field, component, or segment the message does not contain still name it from the profile or event schema. The `ruleId` of every finding is unchanged; only the text changes.

  - No value, part of a value, version, or Segment ID from the message appears in a finding's text: `lint-profile-withdrawn`, `lint-profile-backward-compatible`, `lint-profile-table-values`, `lint-profile-timestamps`, `lint-message-version`, `lint-required-message-header`, and `lint-segment-header-length` describe the content instead (`The day is past the end of its month; …`, `The Segment ID is 4 characters long; …`).
  - `lint-profile-segment-order` reports every out-of-place segment with one message, whatever its Segment ID or segment group.
  - `lint-no-trailing-empty-field` and `lint-required-message-header` report a segment with an empty Segment ID with the same message as any other.
  - `lint-profile-field-max-length`, `lint-profile-field-repetition`, `lint-profile-extra-components`, `lint-profile-withdrawn`, and `lint-profile-backward-compatible` check an element whose data has no `id`, such as one a site's own annotator sets.
  - `annotate-profile-fields-code-systems` reports a code system it cannot load in one sentence.

- Updated dependencies [[`cb4c228`](https://github.com/rethinkhealth/glion/commit/cb4c2284ffe7925108a3ea7b9f5bd1b3ec39641e), [`7470329`](https://github.com/rethinkhealth/glion/commit/747032939dec8b334465c63ce654aaf460b20830), [`dd82064`](https://github.com/rethinkhealth/glion/commit/dd82064b0b388051ca25852afda01527ddade891)]:
  - @glion/annotate-profile-datatypes@0.27.0
  - @glion/util-timestamp@0.27.0
  - @glion/util-visit@0.27.0
  - @glion/ast@0.27.0
