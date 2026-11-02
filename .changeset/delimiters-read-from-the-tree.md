---
"@glion/utils": minor
"@glion/util-query": minor
"@glion/to-hl7v2": minor
"@glion/decode-escapes": minor
"@glion/encode-escapes": minor
"@glion/hl7v2": minor
---

**Breaking:** the delimiters of a message are read from its tree, and `file.data.delimiters` is gone. A transform that changes MSH-2 now changes the delimiters the message is written with.

- Remove `@glion/annotate-delimiters`; `delimiters()` from `@glion/util-query` reads the same delimiters from a tree
- Change `delimiters()` to read a message as `@glion/parser` does: only a message header the message opens with declares delimiters, so a later `MSH`, or one after a batch header, is no longer read as the header (#1172)
- Add a `fallback` argument to `delimiters()`, and add `msh()` to `@glion/util-query`
- Change `hl7v2ToHl7v2`, `hl7v2DecodeEscapes`, and `hl7v2EncodeEscapes` to read `options.delimiters` where they take it, then MSH-1 and MSH-2, then the `delimiters` of the processor's `settings`, then `|^~\&`
- Remove `hl7v2AnnotateDelimiters` from the `@glion/hl7v2` pipeline
- Change `toHl7v2` to write a node other than a `Root` with the `delimiters` it is given: a delimiter left out is absent, except `field`, where it took the default
- Write an `MSH` later in a message as any other segment in `toHl7v2`, and handle its escape sequences in `hl7v2DecodeEscapes` and `hl7v2EncodeEscapes`; `toHl7v2` used to drop its first field
- Add `ENCODING_CHARACTERS` to `@glion/utils`, and read MSH-2 by UTF-16 code unit in `delimiters()`, as `@glion/parser` does
