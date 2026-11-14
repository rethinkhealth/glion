# Building the HL7v2 specification in Lean

Lessons that build the specification in `spec/` from the statements of HL7 Version 2.8.1, Chapter 2, in order. Each lesson builds on the one before, and every Lean example in them builds against the specification.

Start with [the statements](statements.md): the list of what Chapter 2 says. Each lesson formalizes a few of them.

| Lesson                              | Formalizes                                                                     | You learn                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| [1. A message as data](lesson_1.md) | The delimiters, and the levels of a message from a subcomponent to the message | Running Lean: `#eval`, `#check`, `def`, `structure`, `abbrev`, lists, `fun` and `map` |
