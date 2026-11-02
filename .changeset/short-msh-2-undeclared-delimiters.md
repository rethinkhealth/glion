---
"@glion/ast": minor
"@glion/utils": minor
"@glion/parser": minor
"@glion/util-query": minor
"@glion/to-hl7v2": minor
"@glion/decode-escapes": patch
"@glion/encode-escapes": patch
---

**Breaking:** a delimiter MSH-2 does not declare is absent, and the message is read without it. `MSH|^~&` declares the escape character `&` and no subcomponent separator, so `a&F&b` is the one value `a|b`, where it was read as the subcomponents `a`, `F`, and `b` (#1170). In a message that opens `MSH|^~\`, `&` is data.

- Change `Delimiters` in `@glion/ast`: `component`, `repetition`, `escape`, and `subcomponent` are optional, and absent when MSH-2 does not declare them
- Change `detectDelimiters` in `@glion/parser` and `delimiters()` in `@glion/util-query` to leave out a delimiter MSH-2 does not declare, where they gave it its default; a message without a message header segment is still read with `|^~\&`
- Add `MissingSeparatorError` to `@glion/to-hl7v2`, thrown for a field, field repetition, or component with more than one child and no separator to write them apart
- Add `MissingEscapeCharacterError` to `@glion/utils`, a subclass of `EscapeSequenceError` that `escapes.write` throws for a separator or line break when the delimiters have no escape character, writing every other character as it is; `escapes.read` returns the text as it is
