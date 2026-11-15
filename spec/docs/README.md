# Building the HL7v2 specification in Lean

Lessons that build the specification in `spec/` from the statements of HL7 Version 2.8.1, Chapter 2, in order. Each lesson builds on the one before, and every Lean example in them builds against the specification.

Start with [the statements](statements.md): the list of what Chapter 2 says. Each lesson formalizes a few of them.

| Lesson                                        | Formalizes                                                                                                                  | You learn                                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [1. A message as data](lesson_1.md)           | The delimiters, and the levels of a message from a subcomponent to the message                                              | Running Lean: `#eval`, `#check`, `def`, `structure`, `abbrev`, lists, `fun` and `map`                         |
| [2. Claims and rules](lesson_2.md)            | The three-character Segment ID, as the first rule                                                                           | `Prop`, `example`, `theorem`, `rfl`, `decide`, `∀`, and a structure of rules                                  |
| [3. A text represents a message](lesson_3.md) | The relation every later lesson is about: when a text is the text of a message, level by level                              | A relation, a claim defined by cases (`inductive`), `∃`, `∧`, and proofs built from cases                     |
| [4. The sender](lesson_4.md)                  | The construction of §2.6.1: how a sender writes a message. Its text represents the message, and a message has no other text | Functions on lists: `++`, `::`, `intercalate`, `flatMap`; `induction`, `↔`, and proving `¬`                   |
| [5. One text, one meaning](lesson_5.md)       | The claim the standard relies on and never states: a text represents at most one message                                    | Injectivity, a reader as a proof device, `rw`, `refine … ?_`, reading goals, and rules that come from a proof |
