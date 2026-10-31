import Hl7v2.Spec.Delimiters

/-!
# Escape sequences (§2.7.1)

How a sender writes a delimiter that is part of the data. Source: HL7 Version
2.8.1, Chapter 2 (Control).

"An escape sequence consists of the escape character followed by an escape code
ID of one character, zero (0) or more data characters, and another occurrence of
the escape character." A delimiter in data is written as one of five:

| Sequence | Stands for              |
| -------- | ----------------------- |
| `\F\`    | the field separator     |
| `\S\`    | the component separator |
| `\T\`    | the subcomponent separator |
| `\R\`    | the repetition separator |
| `\E\`    | the escape character    |

`\` is the suggested escape character; a message writes the one it declares in
MSH-2. Every other character of data is written as it is.
-/

namespace Hl7v2.Spec

/-- The escape code IDs of the five sequences above. -/
def escapeCodes : List Char := ['F', 'S', 'T', 'R', 'E']

/-- How a sender writes one character of data. -/
def escapeChar (d : Delimiters) (c : Char) : List Char :=
  if c = d.field then [d.escape, 'F', d.escape]
  else if c = d.component then [d.escape, 'S', d.escape]
  else if c = d.subcomponent then [d.escape, 'T', d.escape]
  else if c = d.repetition then [d.escape, 'R', d.escape]
  else if c = d.escape then [d.escape, 'E', d.escape]
  else [c]

/-- How a sender writes a value: `SMITH&JONES` is written `SMITH\T\JONES` with
the suggested delimiters. -/
def escape (d : Delimiters) (value : List Char) : List Char :=
  value.flatMap (escapeChar d)

end Hl7v2.Spec
