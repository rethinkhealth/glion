import Hl7v2.Spec.Delimiters

/-!
# Escape sequences (§2.7)

How a sender writes a value. Source: HL7 Version 2.8.1, Chapter 2 (Control).

"An escape sequence consists of the escape character followed by an escape code
ID of one character, zero (0) or more data characters, and another occurrence of
the escape character" (§2.7.1). A value is a list of pieces: characters of data,
and escape sequences that are not characters.

A delimiter in data is written as one of five sequences (§2.7.1, §2.7.5):

| Sequence | Stands for                 |
| -------- | -------------------------- |
| `\F\`    | the field separator        |
| `\S\`    | the component separator    |
| `\T\`    | the subcomponent separator |
| `\R\`    | the repetition separator   |
| `\E\`    | the escape character       |

A control character other than the segment terminator (U+0000 to U+001F) is
written as hexadecimal data (§2.7.6): a line feed is `\X0A\`. Every other
character of data is written as it is.

The other sequences §2.7 defines are pieces of their own, written as their
escape code ID and data characters between two escape characters, and never
interpreted:

| Sequence              | Section | Stands for                                |
| --------------------- | ------- | ----------------------------------------- |
| `\P\`                 | §2.7.2  | the truncation character                  |
| `\Cxxyy\`, `\Mxxyyzz\` | §2.7.3 | a switch to another character set         |
| `\H\`, `\N\`          | §2.7.4  | start and end highlighting                |
| `\Xdd…\`              | §2.7.6  | hexadecimal data, read by agreement       |
| `\.br\`, `\.sp\`, …   | §2.7.7  | a formatting command of formatted text    |
| `\Z…\`                | §2.7.8  | locally defined, read by agreement        |

`\` is the suggested escape character; a message writes the one it declares in
MSH-2. Which data types may use each sequence (§2.7.1) is not modelled.
-/

namespace Hl7v2.Spec

/-- One piece of a value (`escapeSequenceForm`): a character of data, or an escape sequence of §2.7.2 to
§2.7.8, held as its escape code ID and data characters (`H` for `\H\`, `.sp 2`
for `\.sp 2\`). -/
inductive Piece where
  | char (c : Char)
  | sequence (code : List Char)
  deriving DecidableEq, Repr

/-- A value of data characters only: `data "SMITH"`. -/
def data (s : String) : List Piece := s.toList.map .char

/-- The escape code IDs of the five sequences that stand for a delimiter. -/
def escapeCodes : List Char := ['F', 'S', 'T', 'R', 'E']

/-- §2.7.6: "(0, 1, . . . , 9, A, . . . , F)", in order. -/
def hexDigits : List Char :=
  ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F']

def isHexDigit (c : Char) : Bool := c ∈ hexDigits

/-- One or more pairs of hexadecimal digits. -/
def isHexPairs (ds : List Char) : Bool := ds ≠ [] && ds.length % 2 == 0 && ds.all isHexDigit

/-- The hexadecimal digit for `n % 16`. -/
def hexDigit (n : Nat) : Char := (hexDigits.drop (n % 16)).headD '0'

/-- The number a hexadecimal digit stands for. -/
def hexValue (c : Char) : Nat := hexDigits.idxOf c

/-- The characters of every escape code the specification writes for a character:
`F`, `S`, `T`, `R`, `E`, and `X` with hexadecimal digits. -/
def codeCharacters : List Char := escapeCodes ++ 'X' :: hexDigits

/-- A control character other than the segment terminator. -/
def isControl (c : Char) : Bool := c.toNat < 0x20 && c != segmentTerminator

/-- How a sender writes a control character: `X0A` for a line feed. -/
def controlCode (c : Char) : List Char := ['X', hexDigit (c.toNat / 16), hexDigit (c.toNat % 16)]

/-- The control character an escape code stands for, if it is `X` and two digits
that name one. -/
def controlChar? : List Char → Option Char
  | ['X', h, l] =>
    if isHexDigit h && isHexDigit l && isControl (Char.ofNat (hexValue h * 16 + hexValue l)) then
      some (Char.ofNat (hexValue h * 16 + hexValue l))
    else none
  | _ => none

/-- An optional space, then `number`: `.sp 2` and `.sp2` both skip two lines. -/
def isArgument (number : List Char → Bool) : List Char → Bool
  | ' ' :: rest => number rest
  | rest => number rest

/-- A positive integer, or nothing (`.sp`, `.sk`). -/
def isOptionalCount (ds : List Char) : Bool := ds.all Char.isDigit

/-- A positive or negative integer (`.in`, `.ti`): `+4`, `-4`, `4`. -/
def isSignedNumber : List Char → Bool
  | '+' :: ds | '-' :: ds | ds => ds ≠ [] && ds.all Char.isDigit

/-- The formatting commands of formatted text (§2.7.7), after the period. -/
def isFormattingCommand : List Char → Bool
  | 's' :: 'p' :: arg => isArgument isOptionalCount arg
  | 's' :: 'k' :: arg => isArgument isOptionalCount arg
  | 'i' :: 'n' :: arg => isArgument isSignedNumber arg
  | 't' :: 'i' :: arg => isArgument isSignedNumber arg
  | ['b', 'r'] | ['f', 'i'] | ['n', 'f'] | ['c', 'e'] => true
  | _ => false

/-- Whether `code` is the escape code ID and data characters of a sequence §2.7.2
to §2.7.8 defines (`definedEscapeSequences`). `\X…\` and `\Z…\` are carried, not read (`hexAndLocalByAgreement`). The five sequences for a delimiter, and `\Xdd\` for a control
character, are not: they are characters. -/
def isDefinedSequence : List Char → Bool
  | ['P'] | ['H'] | ['N'] => true
  | 'C' :: ds => ds.length == 4 && ds.all isHexDigit
  | 'M' :: ds => (ds.length == 4 || ds.length == 6) && ds.all isHexDigit
  | 'X' :: ds => isHexPairs ds && (controlChar? ('X' :: ds)).isNone
  | 'Z' :: _ => true
  | '.' :: command => isFormattingCommand command
  | _ => false

/-- How a sender writes one character of data (`delimitersEscapedInData`). `\P\` is held as a sequence,
not as the truncation character (`truncationCharacter`). -/
def escapeChar (d : Delimiters) (c : Char) : List Char :=
  if c = d.field then [d.escape, 'F', d.escape]
  else if c = d.component then [d.escape, 'S', d.escape]
  else if c = d.subcomponent then [d.escape, 'T', d.escape]
  else if c = d.repetition then [d.escape, 'R', d.escape]
  else if c = d.escape then [d.escape, 'E', d.escape]
  else if isControl c then d.escape :: controlCode c ++ [d.escape]
  else [c]

/-- How a sender writes one piece: a character as above, a sequence between two
escape characters. -/
def escapePiece (d : Delimiters) : Piece → List Char
  | .char c => escapeChar d c
  | .sequence code => d.escape :: code ++ [d.escape]

/-- How a sender writes a value: `SMITH&JONES` is written `SMITH\T\JONES` with
the suggested delimiters, and `240*` highlighted is written `\H\240*\N\`. -/
def escape (d : Delimiters) (value : List Piece) : List Char :=
  value.flatMap (escapePiece d)

end Hl7v2.Spec
