# @glion/lint-profile-backward-compatible

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @glion/annotate-profile-datatypes@0.31.0
  - @glion/annotate-profile-fields@0.31.0
  - @glion/ast@0.31.0
  - @glion/to-hl7v2@0.31.0
  - @glion/util-query@0.31.0
  - @glion/util-visit@0.31.0
  - @glion/utils@0.31.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`d769436`](https://github.com/rethinkhealth/glion/commit/d7694361597b574af2203052f80c029a55484cb1)]:
  - @glion/to-hl7v2@0.30.0
  - @glion/annotate-profile-fields@0.30.0
  - @glion/util-query@0.30.0
  - @glion/util-visit@0.30.0
  - @glion/annotate-profile-datatypes@0.30.0
  - @glion/ast@0.30.0
  - @glion/utils@0.30.0

## 0.29.0

### Patch Changes

- [#1053](https://github.com/rethinkhealth/glion/pull/1053) [`c76a45d`](https://github.com/rethinkhealth/glion/commit/c76a45d2c9345db5ad6550f74b4fdc7546d2fd56) Thanks [@meleksomai](https://github.com/meleksomai)! - Fix `encodeEscapes` writing an escape sequence that holds a delimiter, which made a message whose delimiters include an escape code grow on every parse and serialize round trip ([#1051](https://github.com/rethinkhealth/glion/issues/1051)).

  - Write a character whose escape code holds a delimiter, such as `\E\` when `E` is the component separator, as `\Xdd\`, with a hexadecimal digit `A`–`F` in lowercase when its uppercase form is a delimiter
  - Add `EscapeSequenceError`, thrown by `encodeEscapes`, `toHl7v2`, and `hl7v2EncodeEscapes` for a character that no escape sequence can write with the message's delimiters, and export it from `@glion/to-hl7v2`
  - Report `glion send` of such a message as an `invalid` outcome instead of exiting with an unexpected error
  - Report a withdrawn or backward-compatible field without `actual` when the message's delimiters cannot write it, instead of rejecting the lint run

- Updated dependencies [[`c76a45d`](https://github.com/rethinkhealth/glion/commit/c76a45d2c9345db5ad6550f74b4fdc7546d2fd56)]:
  - @glion/utils@0.29.0
  - @glion/to-hl7v2@0.29.0
  - @glion/annotate-profile-datatypes@0.29.0
  - @glion/annotate-profile-fields@0.29.0
  - @glion/util-query@0.29.0
  - @glion/util-visit@0.29.0
  - @glion/ast@0.29.0

## 0.28.0

### Patch Changes

- Updated dependencies [[`ccd49ff`](https://github.com/rethinkhealth/glion/commit/ccd49ff4fb7e82a628ef05ac905110a9c9e173ad)]:
  - @glion/to-hl7v2@0.28.0
  - @glion/utils@0.28.0
  - @glion/annotate-profile-fields@0.28.0
  - @glion/util-query@0.28.0
  - @glion/util-visit@0.28.0
  - @glion/annotate-profile-datatypes@0.28.0
  - @glion/ast@0.28.0

## 0.27.1

### Patch Changes

- Updated dependencies [[`0e0383e`](https://github.com/rethinkhealth/glion/commit/0e0383e86df9e189aeea76c7d468fd7812230cb0)]:
  - @glion/util-visit@0.27.1
  - @glion/annotate-profile-fields@0.27.1
  - @glion/annotate-profile-datatypes@0.27.1
  - @glion/ast@0.27.1
  - @glion/to-hl7v2@0.27.1
  - @glion/util-query@0.27.1
  - @glion/utils@0.27.1

## 0.27.0

### Patch Changes

- [#987](https://github.com/rethinkhealth/glion/pull/987) [`4a8da16`](https://github.com/rethinkhealth/glion/commit/4a8da1634fa33ed941699a6f9fbe88950af0983d) Thanks [@meleksomai](https://github.com/meleksomai)! - Lint findings describe the node they are placed on, never name it, and never contain content from the message (ADR 0030). ``Field `PID-5` (Patient Name) is 300 characters long; it allows at most 250.`` is now `The value is 300 characters long; the field allows at most 250.` The finding's `place` and `ancestors` locate the node, and `actual` carries the content. Findings about a field, component, or segment the message does not contain still name it from the profile or event schema. The `ruleId` of every finding is unchanged; only the text changes.

  - No value, part of a value, version, or Segment ID from the message appears in a finding's text: `lint-profile-withdrawn`, `lint-profile-backward-compatible`, `lint-profile-table-values`, `lint-profile-timestamps`, `lint-message-version`, `lint-required-message-header`, and `lint-segment-header-length` describe the content instead (`The day is past the end of its month; …`, `The Segment ID is 4 characters long; …`).
  - `lint-profile-segment-order` reports every out-of-place segment with one message, whatever its Segment ID or segment group.
  - `lint-no-trailing-empty-field` and `lint-required-message-header` report a segment with an empty Segment ID with the same message as any other.
  - `lint-profile-field-max-length`, `lint-profile-field-repetition`, `lint-profile-extra-components`, `lint-profile-withdrawn`, and `lint-profile-backward-compatible` check an element whose data has no `id`, such as one a site's own annotator sets.
  - `annotate-profile-fields-code-systems` reports a code system it cannot load in one sentence.

- Updated dependencies [[`cb4c228`](https://github.com/rethinkhealth/glion/commit/cb4c2284ffe7925108a3ea7b9f5bd1b3ec39641e), [`d702f6a`](https://github.com/rethinkhealth/glion/commit/d702f6a31ff95af55b3850e18d1d3f13f3accce7), [`799a57c`](https://github.com/rethinkhealth/glion/commit/799a57c8dd6bab65c3c655cef2515be4c0eb45d0), [`3dfa36e`](https://github.com/rethinkhealth/glion/commit/3dfa36e5ba03ad7bfe4ce037cc1bd12c53d42a1d), [`ac05055`](https://github.com/rethinkhealth/glion/commit/ac05055ab3348054d3c98429e53e7c105a82c02f), [`58c6ab6`](https://github.com/rethinkhealth/glion/commit/58c6ab6b4052d68c3361a9aa56c4057f7b034728), [`34d8e21`](https://github.com/rethinkhealth/glion/commit/34d8e217a9655cee2fdf42202ed58168c3ed72ed), [`dd82064`](https://github.com/rethinkhealth/glion/commit/dd82064b0b388051ca25852afda01527ddade891)]:
  - @glion/annotate-profile-datatypes@0.27.0
  - @glion/annotate-profile-fields@0.27.0
  - @glion/util-query@0.27.0
  - @glion/util-visit@0.27.0
  - @glion/to-hl7v2@0.27.0
  - @glion/ast@0.27.0
  - @glion/utils@0.27.0

## 0.26.0

### Patch Changes

- Updated dependencies []:
  - @glion/annotate-profile-datatypes@0.26.0
  - @glion/annotate-profile-fields@0.26.0
  - @glion/ast@0.26.0
  - @glion/to-hl7v2@0.26.0
  - @glion/util-query@0.26.0
  - @glion/util-visit@0.26.0
  - @glion/utils@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [[`ddc5c76`](https://github.com/rethinkhealth/glion/commit/ddc5c769720e9ef6689c53baa6b379d4c8525283)]:
  - @glion/annotate-profile-datatypes@0.25.0
  - @glion/annotate-profile-fields@0.25.0
  - @glion/ast@0.25.0
  - @glion/to-hl7v2@0.25.0
  - @glion/util-query@0.25.0
  - @glion/util-visit@0.25.0
  - @glion/utils@0.25.0

## 0.24.0

### Minor Changes

- [#917](https://github.com/rethinkhealth/glion/pull/917) [`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68) Thanks [@meleksomai](https://github.com/meleksomai)! - `@glion/lint-profile-withdrawn` reports a value in any element whose optionality is `W` (withdrawn), and `@glion/lint-profile-backward-compatible` one whose optionality is `B` (backward compatible). Each is one visit over the tree that reads `optionality` from `node.data`, so it covers fields, components and subcomponents alike, and names the element by its `id`, such as `` `AL1-6` (Identification Date) has a value; it is withdrawn in v2.7 and must be empty. ``. Both accept an empty element and the explicit null `""`, carry the element's value in `actual`, and list the accepted values (empty and `""`) in `expected`. They need `@glion/annotate-profile-fields` and `@glion/annotate-profile-datatypes` to run first.

  `@glion/preset-lint-profile-recommended` runs those two annotators after `annotate-profile-context`, and includes `withdrawn` as an error and `backward-compatible` as a warning: a withdrawn element must be empty, while HL7v2 still allows a value in a backward-compatible one.

  **Breaking:** through the preset, `parseHL7v2` from `@glion/hl7v2` now marks a message fatal when it values a withdrawn field, such as EVN-1, MSA-3 or PID-19 from v2.7, and warns on a valued backward-compatible field, such as EVN-1 in v2.5 or v2.5.1. The preset's annotators also leave profile metadata on `node.data` of fields, components and subcomponents. To keep the old behavior, compose the profile rules without the preset, or turn a rule off after it: `.use(hl7v2LintWithdrawn, false)`.

### Patch Changes

- Updated dependencies [[`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68), [`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68), [`84e2713`](https://github.com/rethinkhealth/glion/commit/84e2713a43047a3234d0ce3addd959b6b76bdf68)]:
  - @glion/annotate-profile-datatypes@0.24.0
  - @glion/annotate-profile-fields@0.24.0
  - @glion/utils@0.24.0
  - @glion/to-hl7v2@0.24.0
  - @glion/util-query@0.24.0
  - @glion/util-visit@0.24.0
  - @glion/ast@0.24.0
