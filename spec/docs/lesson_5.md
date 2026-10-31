# Lesson 5: Checking glion against the specification

Lessons 1 to 4 built a specification and proved things about it. None of that says anything about glion yet: `encode_injective` is a fact about the Lean function `encode`, not about `@glion/parser`. This lesson connects the two. The specification runs as a program, called an **oracle**, and a fast-check test asks it about many generated messages and compares its answers with what glion does.

This is the step the formal-verification process calls "the specification as a test oracle". It does not prove glion correct. It checks glion against a statement you own, on thousands of messages, and every disagreement is either a bug in glion or a gap in the statement.

The lesson reads four files:

| File                              | Role                                                                  |
| --------------------------------- | --------------------------------------------------------------------- |
| `spec/Oracle.lean`                | The specification as a program                                        |
| `differential/src/oracle.ts`      | Talking to the oracle, and the message shape both sides share         |
| `differential/src/abstraction.ts` | The abstraction function: glion's tree to the specification's message |
| `differential/src/generators.ts`  | The generator                                                         |
| `differential/tests/`             | Tests of the three files above: the harness                           |
| `differential/properties/`        | The claims about glion, one file per claim                            |

The two test directories mean different things when they fail. A failure in `tests/` means the harness is wrong, and nothing in `properties/` can be believed until it is fixed. A failure in `properties/` means glion and the specification disagree: a finding, and a decision about which side is right.

```text
fast-check ──message──▶ Lean oracle ──text, failures──▶ glion parser ──tree──▶ abstraction ──message──▶ compare
 (generator)            (Oracle.lean)                    (@glion/parser)        (toSpecMessage)
```

## Step 1: The specification as a program

Every `def` in the specification is a program; lesson 1 ran them with `#eval`. `Oracle.lean` wraps two of them, `encode` and `Message.failures`, in a program you can run from a terminal. It reads one message per line, as JSON, and answers on one line.

Build it and try four messages:

```sh
cd spec
lake build oracle
printf '%s\n' \
  '{"delimiters":"|^~\\&","header":[],"segments":[{"id":"PID","fields":[[[["1"]]],[[["Smith"],["John"]]]]}]}' \
  '{"delimiters":"|^~\\&","header":[],"segments":[{"id":"PID","fields":[[[["a|b"]]]]}]}' \
  '{"delimiters":"|^~\\&","header":[],"segments":[{"id":"PID","fields":[[[["a\rPV1"]]]]}]}' \
  '{"delimiters":"|^~","header":[],"segments":[]}' \
  | .lake/build/bin/oracle
```

The answers:

```text
{"failures":[],"text":"MSH|^~\\&\rPID|1|Smith^John\r"}
{"failures":[],"text":"MSH|^~\\&\rPID|a\\F\\b\r"}
{"failures":["well_formed_subcomponent_no_terminator"],"text":"MSH|^~\\&\rPID|a\rPV1\r"}
{"error":"delimiters must be five characters: field, component, repetition, escape, subcomponent"}
```

- The first message is well formed, and `text` is how a sender writes it.
- The second holds a `|` inside a value. It is well formed: the oracle writes the `|` as the escape sequence `\F\` (§2.7.1, lesson 6).
- The third is `oneSegment` from lesson 4: a segment terminator inside a value. The oracle still encodes it, and names the rule it breaks.
- The fourth is not a `Message` at all, because a `Delimiters` holds exactly five characters. The oracle refuses it instead of guessing.

The JSON has the same nesting as the Lean type. A field is a list of repetitions, a repetition a list of components, a component a list of subcomponent strings:

```text
"Smith^John"  as a field:  [ [ ["Smith"], ["John"] ] ]
                           │ │ └ component 1, one subcomponent
                           │ └ repetition 1
                           └ the field
```

Read `Oracle.lean` top to bottom now. `field`, `segment` and `message` turn JSON into the Lean structures; `answer` calls `encode` and `failures`; `loop` reads lines until the input ends. The only part that is not plain conversion is `answer`, and it is two lines.

## Step 2: Asking the oracle from TypeScript

`startOracle` in `differential/src/oracle.ts` starts the program once and keeps it running. `ask(message)` writes one JSON line and waits for one line back:

```ts
const oracle = startOracle();
const { text, failures } = await oracle.ask(message);
```

Starting a Lean program takes a moment; answering one line takes almost nothing. So the test starts it once and asks it hundreds of times. Calls must not overlap, because answers come back in order on one stream; fast-check runs one property run at a time, so they never do.

The TypeScript type `SpecMessage` mirrors the JSON, and through it the Lean `Message`.

## Step 3: The abstraction function, trusted code

To compare glion with the specification, glion's tree must be turned into a `SpecMessage`. That is `toSpecMessage`, in `differential/src/abstraction.ts`. A function from an implementation's state to the specification's is called an **abstraction function**. It is the one piece of code in this lesson that is **trusted** the way a statement is: if it maps glion's tree wrongly, a property can pass while glion is wrong, or fail while glion is right. Read it as carefully as you read a statement.

Two things it does:

- **MSH-1 and MSH-2 become the delimiters.** glion keeps them as the first two fields of MSH; the specification keeps them apart. The abstraction function takes their values, and maps the rest of MSH, from MSH-3 on, to `header`.
- **An empty level becomes one empty element.** glion writes an empty component with no children. The specification writes it as one empty subcomponent:

```text
a^^b   glion:          [["a"], [], ["b"]]
       specification:  [["a"], [""], ["b"]]
```

The same holds one level up for a repetition (`[[""]]`) and a field (`[[[""]]]`). Both describe the same text; the abstraction function picks the specification's form.

The mapping must also be **one to one**. A field holding one empty repetition, `field [rep []]`, is written as the same text as an empty field, `field []`, and a lenient mapping would turn both into `[[[""]]]`. Then a parser that started writing the first shape, against its own README, would pass every property. So the abstraction function throws on a lone empty child at any level: the parser gives a node children only when the text forces them, and the abstraction function holds it to that. The segment terminator is checked the same way: glion records what ended each segment in `terminator`, and a segment that ended with `\n`, `\r\n` or nothing is another text, so the abstraction function throws on any `terminator` other than `\r`.

Neither of these is a choice about HL7v2. They are choices about how two representations line up, and the abstraction function is where you check them.

## Step 4: The generator, inside the domain

`arbSpecMessage`, in `differential/src/generators.ts`, builds `SpecMessage` values directly, in the specification's shape, with fast-check. It aims for well-formed messages only, because `encode_injective` says nothing about the rest. It builds them well formed by construction:

- **Delimiters** are the suggested `|^~\&` or five distinct characters drawn from a pool.
- **Segment IDs** are three letters or digits.
- **Every level of a field** has one to three elements, never zero, matching the rule about empty levels.
- **Data** draws from letters, digits, a few marks, the five delimiters and whole escape sequences such as `\H\`, and never the segment terminator.

"By construction" is a claim, and `differential/tests/generators.test.ts` tests it with the specification itself:

```ts
it("draws only well-formed messages", async () => {
  // …
  const { failures } = await oracle.ask(message);
  expect(failures).toEqual([]);
});
```

If the generator ever drifts outside the domain, Lean says which rule it broke. This property passes on every run.

### The generator is the scope

Of everything in the harness, the generator is perhaps the most important part, because it decides the **scope** of every property. The oracle and the abstraction function decide what "agree" means; the generator decides which messages are ever asked about. A message it cannot draw is never checked, however many runs you ask for.

The first property checks one side of the scope: the generator never draws a message _outside_ the domain. Nothing checks the other side, how much of the domain it _reaches_. And today it reaches only a small part of it. The domain is every message `Message.WF` accepts; the generator draws far fewer:

| The specification allows                                                                                             | The generator draws                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any five distinct delimiters other than `\r`, letters included, though no separator may be `F`, `S`, `T`, `R` or `E` | The suggested `\|^~\&`, or five of `\| ^ ~ \ & # * ! % +`                                                                                                      |
| Any character in data other than `\r`: unused pool characters, letters, `\n`, non-ASCII                              | 17 characters, `abcFSTREXYZ019 .-`, the five delimiters, and 11 escape sequences drawn whole (`\F\` … `\E\`, `\H\`, `\N\`, `\.br\`, `\.sp\`, `\X41\`, `\Zab\`) |
| Data of any length                                                                                                   | At most 4 pieces, each a character or a whole sequence                                                                                                         |
| Any number of repetitions, components, subcomponents, fields and segments                                            | At most 3 of each level, 4 fields, 4 MSH fields, 3 segments                                                                                                    |
| Any 3-character segment ID without `\r`, a separator included                                                        | 3 characters from `A`–`Z` and `0`–`9`                                                                                                                          |

The oracle confirms that each of these is well formed, and the generator can produce none of them:

```text
id "A|B"                          → {"failures":[],"text":"MSH|^~\\&\rA|B|x\r"}
data "a\b*é" with delimiters #|&~^ → {"failures":[],"text":"MSH#|&~^\rPID#a\\b*é\r"}
delimiters "abcde"                → {"failures":[],"text":"MSHabcde\r"}
```

Some of these gaps hide real questions. A segment ID with a `|` in it is well formed for the specification, yet `A|B|x` reads like a segment `A` with fields `B` and `x`; either the specification is too loose or the generator should be asking glion about it. Letters as delimiters collide with escape codes (#1051): the specification rules out `F`, `S`, `T`, `R` and `E` as separators, and glion writes `\Xdd\` instead, so the two may disagree on a letter delimiter that the pool never draws. And the sequences are a fixed list of 11: a character set switch (`\C2842\`) or a longer hexadecimal sequence never appears, so step 7's lesson repeats one level further.

Narrowing the generator was a choice to get the harness running, not a statement about HL7v2. Widening it is the next step, and each widening is likely to find a disagreement, as adding the escape letters did. Treat the generator like the statement: its scope is a decision you own, and it should be reviewed as one.

## Step 5: The two properties about glion

The second property is the practical side of `encode_injective`. The theorem says a well-formed text has one meaning; the parser must find that meaning:

```ts
const { text } = await oracle.ask(message);
expect(toSpecMessage(parser.parse(text))).toEqual(message);
```

Read it as a loop around the diagram: a message goes into Lean, comes out as text, goes into glion, comes out as a tree, goes through the abstraction function, and must arrive where it started.

The third property checks the other direction. glion's serializer must write a parsed message back as the specification's text:

```ts
expect(String(await roundTrip.process(text))).toBe(text);
```

Together they say: glion reads what the specification writes, and writes what the specification writes.

## Step 6: Running it, and reading a failure

```sh
pnpm --filter @glion/differential test:spec
```

The script builds the oracle, runs `tests/`, and runs `properties/` only when `tests/` passes. The root `pnpm test` does not run it, so a machine without Lean can still run every other test.

When a property fails, fast-check **shrinks** the input: it tries smaller and smaller messages until it finds one that still fails, and prints that one. The shrunk inputs are short enough to read.

**A finding that was settled: no `\r` after the last segment.** The first run of the serializer property failed on a message with no segments at all, and delimiters `#|&~^`:

```text
spec:  MSH#|&~^\r
glion: MSH#|&~^
```

`@glion/to-hl7v2` joined segments with `\r`, so nothing followed the last one. The specification writes `\r` after every segment, following Chapter 2's segment terminator, and every version from v2.3 to v2.9 says the same. glion changed, not the specification: issue #1137, then #1138 and #1148. Each segment node now records what ended it in `terminator`, and the serializer writes it back. The abstraction function checks that every segment's `terminator` is `\r`, because the specification writes no other.

**A finding that was settled: escape sequences.** Next, both properties failed on data holding the escape character. The smallest failing message for the parser had one subcomponent whose value was the three characters `\R\`:

```text
{"delimiters":"|^~\\&","header":[],"segments":[{"fields":[[[["\\R\\",""],[""]]]],"id":"AAA"}]}
```

glion read `\R\` as an escape sequence (§2.7.1) and decoded it to `~`. The specification had no escape sequences: it wrote the escape character as ordinary data. Here glion followed the standard, so the specification changed: it now writes a delimiter in data as its escape sequence, and the escape character itself as `\E\`. That data reads `\E\R\E\` on the wire, and glion reads it back as `\R\`. Lesson 6 reads the change.

**The finding still open: formatting commands.** The parser property now passes, and the serializer property fails:

```text
{"delimiters":"|*+!%","header":[[[["!H!"],[""]],[[""]]]],"segments":[]}

spec:  MSH|*+!%|!E!H!E!*+\r
glion: MSH|*+!%|!H!*+\r
```

`!` is the escape character. The data is the three characters `!H!`, and the specification writes them `!E!H!E!`. glion's parser reads that back as `!H!`, which is right. Its serializer then writes `!H!` as it is, because `@glion/to-hl7v2` copies a formatting command (`\H\`, `\N\`, `\.sp\`) or a locally defined sequence (`\Z…\`) through unchanged. The text it writes holds the highlighting command `\H\` (§2.7.4), which the sender never wrote. The tree cannot tell the two apart: `\H\` and `\E\H\E\` parse to the same value.

None of these findings was a bug to fix on the spot. Each one is a decision about which side is right, and that decision is yours, the owner of the statement.

## Step 7: What the generator does not draw, the property does not check

The parser property first passed 200 runs. The generator could put the escape character in data, but its data letters were only `a`, `b`, `c` and digits, so it never wrote `\` followed by `F`, `S`, `T`, `R` or `E` and another `\`. A sequence glion would decode never appeared, and the passing property hid the disagreement.

Adding the escape letters to `DATA` made the property fail within a few runs. The line now carries a comment saying why the letters are there.

It happened again after the specification learned escape sequences. Both properties passed 200 runs, but a formatting command such as `\H\` came up in 19 of 5,000 generated messages, and in none of the 200 a run uses: three characters in a row, each picked from 24. The generator now draws whole sequences, one piece in five, from a list of 11 (`SEQUENCES`), and the serializer property fails within a few runs.

This is the main lesson about generators: a property only checks the inputs its generator can reach. Before you trust a green property, ask what its generator never draws.

## What this does and does not show

- **It shows** that on every message the generator drew, glion and the specification agreed, or it prints the one where they did not.
- **It does not prove** anything about glion. Two hundred runs are evidence, not a proof; a message the generator cannot draw is never checked.
- **The trusted pieces** are the statement (the Lean definitions), the abstraction function, and the JSON conversion in `Oracle.lean`. Everything else, the oracle's answers included, comes from those.

The proofs of lessons 3 and 4 make the specification itself trustworthy: `encode_injective` guarantees that the text the oracle writes has one meaning, so the parser property asks for something that exists. The oracle then carries that guarantee over to glion, as far as the generator reaches.

## Exercises

**1. A wrong abstraction function.** In `toSpecMessage`, change the empty component from `[""]` to `[]`:

```ts
const component = (node: Component): string[] =>
  node.children.length === 0 ? [] : node.children.map((s) => s.value);
```

Run `test:spec`. What fails, and do the properties run? Then undo it.

<details><summary>Answer</summary>

The harness fails, on the unit test of the abstraction function:

```text
× maps an empty component to one empty subcomponent
```

`PID|1^^2` parses with an empty component, `comp[]`, and the mutated function maps it to `[]` where the specification has `[""]`. The properties never run. Before the harness had its own tests, the same change made the parser property fail instead, on a field with two empty components, and the failure looked like a bug in glion. That is why the abstraction function is trusted code, and why it has tests of its own.

</details>

**2. A generator outside the domain.** Add `\r` to `DATA`, so data can contain the segment terminator. Run `test:spec`. What fails, and which rule does the oracle name?

<details><summary>Answer</summary>

The harness fails, on `draws only well-formed messages`, with `["well_formed_subcomponent_no_terminator"]`. The shrunk message holds a value that is a lone `\r`:

```text
{"delimiters":"!*+&|","header":[],"segments":[{"fields":[[[["\r",""]],[[""]]]],"id":"AAA"}]}
```

The properties never run, so no failure about glion is reported for a message outside the domain. A `|` in data was once the example here; it is now inside the domain, written as `\F\`.

</details>

**3. Your decision.** For each finding in step 6, write one sentence: which side should change, glion or the specification, and why? Look at Chapter 2's text on the segment terminator and on escape sequences (§2.7) before you answer.

<details><summary>Things to weigh</summary>

- **The final `\r`, as it was decided.** Chapter 2 calls `\r` the segment terminator, which reads as one after every segment, the last included. Changing the specification would have meant stating that the last terminator is optional, and then `encode` writes one text and a receiver accepts two. glion changed instead: `@glion/to-hl7v2` writes each segment's terminator, and `@glion/lint-segment-terminator` reports a segment that ends without `\r`.
- **Escape sequences, as they were decided.** glion follows §2.7.1. Narrowing the harness, so data never contained the escape character, would have kept the specification as it was and recorded the gap. Instead the specification modelled §2.7.1: `encode` writes `\F\` for a `|` in data, the rule `well_formed_subcomponent_clean` became `well_formed_subcomponent_no_terminator`, a rule keeps separators off the escape codes, and the proof of `decode_encode` reads values back through `unescape`. Lesson 6 reads it.
- **Formatting commands, open.** HL7v2 defines `\H\` as markup in a formatted value, so a sender who means the characters `\H\` writes `\E\H\E\`. glion keeps markup in the value as written, so the tree holds `\H\` for both texts, and the serializer has to pick one. Changing glion means a tree that tells markup from data, in `@glion/parser` and `@glion/to-hl7v2`, both core packages. Changing the specification means modelling the formatting commands of §2.7.4 and §2.7.7, and saying which data types may hold them.

</details>
