---
"@glion/parser": minor
"@glion/to-hl7v2": minor
"@glion/hl7v2": minor
"@glion/lint-no-trailing-empty-field": minor
---

Breaking: the parser reads every field separator as written, and the serializer writes every field back ([#1090](https://github.com/rethinkhealth/glion/issues/1090)).

- `@glion/parser` keeps the empty field after a segment's last field separator: `PID|12|` is two fields, `12` and an empty one, and `PID|` is one empty field. A segment that ends with `|` gains an empty last field, and `@glion/hl7v2` outputs it as `""` in the JSON.
- `@glion/parser` reads a segment's Segment ID as the text before the first `|` of its line. A line that starts with `|` has an empty Segment ID, after any segment: `|` is one empty field and `|A` is one field, `A`. Before, the text ahead of the `|` was read as an empty first field, and after a segment holding only its Segment ID the line was lost. A line that starts with another delimiter keeps it in its Segment ID: `^A|B` is the Segment ID `^A` and one field, `B`.
- `@glion/parser` starts a field that opens with a component separator, such as `^First` in `PID|^First`, right after its field separator.
- `@glion/to-hl7v2` removes the `trailingDelimiter` option. A segment is written with the separators its tree holds, so a message read and written back is the same text, and a segment whose one field is empty is written as `PID|`. A segment with an empty Segment ID is written with its field separator like any other: `|A`, where it was `A`.
- `@glion/lint-no-trailing-empty-field` reports `The segment has 2 trailing field separators.`, with the HL7v2 rule in its `note`, in place of `The segment ends with 2 empty fields; a segment should end at its last field with a value.`
