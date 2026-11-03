---
"@glion/lint-encoding-characters-required": minor
"@glion/lint-delimiters-duplicate": minor
"@glion/preset-lint-recommended": minor
---

Add two lint rules for the delimiters of the message header segment, and add both to `@glion/preset-lint-recommended`.

- Add `@glion/lint-encoding-characters-required`, which reports each delimiter MSH-2 leaves out, such as `The encoding characters declare no subcomponent separator.`; the preset runs it at `warning`
- Add `@glion/lint-delimiters-duplicate`, which reports each delimiter that is the same character as an earlier one, such as `The escape character is the same character as the component separator.`, with the character in `actual`; the preset runs it at `error`
