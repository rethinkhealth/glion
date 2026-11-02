---
"@glion/parser": minor
---

Add an `encodingCharacters` option to `hl7v2Parser` and `parseHL7v2`: the delimiters to read a message with where its MSH-2 declares none.

- A delimiter MSH-2 declares is always read as declared, and MSH-2 in the tree holds what is filled, so `MSH|^~&` with `{ subcomponent: "#" }` is written back as `MSH|^~&#`
- Fill in order, up to the first delimiter the option does not give: `MSH|^` with `{ subcomponent: "#" }` fills nothing
- Fill a character another delimiter holds as given: `MSH|^~#` with `{ subcomponent: "#" }` has MSH-2 `^~##`, the same as a message that declares it
- Throw a `TypeError` for a delimiter that is not one character, or is a line break
- Export the `EncodingCharacters` type
