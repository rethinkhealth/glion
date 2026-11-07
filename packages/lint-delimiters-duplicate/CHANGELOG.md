# @glion/lint-delimiters-duplicate

## 0.32.0

### Minor Changes

- [#1180](https://github.com/rethinkhealth/glion/pull/1180) [`39ce68e`](https://github.com/rethinkhealth/glion/commit/39ce68eef61b96e69f58416218a349f1a90e12f4) Thanks [@meleksomai](https://github.com/meleksomai)! - Add two lint rules for the delimiters of the message header segment, and add both to `@glion/preset-lint-recommended`.

  - Add `@glion/lint-encoding-characters-required`, which reports each delimiter MSH-2 leaves out, such as `The encoding characters declare no subcomponent separator.`; the preset runs it at `warning`
  - Add `@glion/lint-delimiters-duplicate`, which reports each delimiter that is the same character as an earlier one, such as `The escape character is the same character as the component separator.`, with the character in `actual`; the preset runs it at `error`

### Patch Changes

- Updated dependencies [[`6c034fe`](https://github.com/rethinkhealth/glion/commit/6c034fed8da07fb7565ffc1cdea447c23990dbd1), [`1149745`](https://github.com/rethinkhealth/glion/commit/114974584f3e71e4c3ffcf3014a7d4e815be57b7), [`783eda5`](https://github.com/rethinkhealth/glion/commit/783eda533ea9d9b39df95d7dbfcd60495a4beb00), [`6c034fe`](https://github.com/rethinkhealth/glion/commit/6c034fed8da07fb7565ffc1cdea447c23990dbd1)]:
  - @glion/util-query@0.32.0
  - @glion/ast@0.32.0
