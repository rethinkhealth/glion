# Learning the HL7v2 specification in Lean

Lessons for reading the Lean specification in `spec/`, in order. Each lesson builds on the one before, and every Lean example in them builds against the specification.

| Lesson                                                         | Reads                                                             | You learn                                                                                                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [1. Delimiters, messages and encoding](lesson_1.md)            | `Spec/Delimiters.lean`, `Spec/Message.lean`, `Spec/Encoding.lean` | Definitions are programs: `def`, `structure`, `#eval`, and the nesting of a field                                                          |
| [2. The rules](lesson_2.md)                                    | `Spec/WellFormed.lean`                                            | `Prop` and `Bool`, instances, `decide`, and your first proofs                                                                              |
| [3. Reading a proof](lesson_3.md)                              | `wf_iff_failures_nil` in `Thm/WellFormed.lean`                    | A claim is a type and a proof is a value; `∧`, `→`, `↔`, `intro`, `rintro`, `constructor`, `simp only`                                     |
| [3, appendix: questions about proofs](lesson_3_appendix.md)    |                                                                   | Why a proof is always true, why the rules exist twice, every lemma in `simp only`, finding lemmas with `simp?`, `Message.WF.field`         |
| [4. One text, one meaning](lesson_4.md)                        | `encode_injective` in `Thm/Encoding.lean`                         | The decoder trick and `rw`                                                                                                                 |
| [4, appendix: designing `decode_encode`](lesson_4_appendix.md) | `Thm/Encoding/Decode.lean`                                        | How a proof is designed: hypotheses as a to-do list, rules from counterexamples, lemmas from repetition                                    |
| [5. Checking glion against the specification](lesson_5.md)     | `Oracle.lean`, `differential/`                                    | The specification as an oracle, the abstraction function as trusted code, generators that stay in the domain, and reading a shrunk failure |

Each lesson asks you to create a practice file such as `Hl7v2/Lesson1.lean`. The library does not import it, so `lake build` ignores it; VS Code checks it when you open it.
