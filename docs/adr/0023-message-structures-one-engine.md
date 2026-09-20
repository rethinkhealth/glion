# ADR 0023: Message Structures as the Contract, One Engine for Order and Groups

## Status

Proposed (2026-09-19)

Supersedes the automaton part of ADR 0012: the DFA generated from the HL7 v2 schemas for segment-order validation is removed. The message structure itself is the bundled data, and one engine runs it for both segment order and segment groups.

## Context

An HL7v2 message structure is a tree. `ORU_R01` is `MSH [{SFT}] { PATIENT_RESULT: [PATIENT] { ORDER_OBSERVATION: [ORC] OBR … [{ OBSERVATION }] … } } [DSC]`: segments nested in named groups, each segment or group optional (`[ ]`), repeating (`{ }`), or both, with choices (`< A | B >`) between alternatives. The parser produces a flat list of segments. Consumers that address "the second order's third result", and the cardinality rules the lint family still lacks ("a required group is missing"), need the tree.

The generated profiles carried a DFA per structure for segment-order validation and, beside it, an `effects` table of group opens and closes keyed by DFA transition. Measured over the 2,136 bundled structures, grouping from that table is not possible:

- **The table is inexact by construction.** Subset construction merges NFA states that sit in different groups, and each transition's closes were the difference of unions of those contexts: 142,000 closes named a group that was not open, and 607 transitions opened two sibling groups at once.
- **The grammar decides some groups only later.** In `CSU_C09`, `ORC` is the optional first segment of both `STUDY_OBSERVATION` and `STUDY_PHARM`; the next segment decides which.
- **The grammar is ambiguous.** In `ORU_R01`, an `ORC` after an `OBX` may start a new `ORDER_OBSERVATION` in the same `PATIENT_RESULT` or a new `PATIENT_RESULT` (its `PATIENT` is optional), and both readings accept the rest of the message. 89 % of the ambiguous transitions are of this kind; only a rule resolves them.

Checking the DFA against the structure it came from also exposed two defects in it: the generator read `xsd:choice` blocks as sequences (108 structures; #815), and compiled `Hxx`, "any segment", so that a named segment could not fill it (32 structures; #816).

The schemas are not always right about choices either. In 18 groups of the chapter 16 and 17 structures (`EHC_*`, `QBP_E03`, `QBP_E22`, `RSP_E03`, `RSP_E22`, `SDR_S31`, `SDR_S32`), both the XML schemas and the normative database flag a sequence as a choice: `EHC_E01`'s `INVOICE_INFORMATION` is `IVC [PYE] [{CTD}] … {PRODUCT_SERVICE_SECTION}`, not one of those. HAPI, generated from the database's structure notation, reads them as sequences. No field in the schema or the database separates them from genuine choices such as `CCI_I22`'s `<OBR | ODS | … | PDA>`.

## Decision

1. **The message structure is the contract and the only bundled data.** Each structure is one JSON file, `src/profiles/v<version>/events/<id>.json`: `segment`, `group`, and `choice` elements, each `optional` and `repeating`. The generator parses the HL7 v2 XML schemas into it and emits nothing else. It reads an `xsd:choice` as a choice, except for an errata table of the 18 groups above, each checked against HAPI, whose members it inlines as a sequence. Every choice alternative matches at least one segment.

2. **One compiler, one engine.** `compileStructure` turns a structure into a Thompson NFA whose epsilon edges are ordered by priority and carry group open and close actions. Two functions run it:
   - `runner(program)` validates order one segment at a time, following every state the program can be in; it replaces the DFA runner with the same interface (`consume`, `accepted`, `expected`).
   - `matchStructure(program, names)` groups segments as a Pike VM: one thread per reading, in priority order, deduplicated by state so that the higher-priority thread wins, each carrying its group actions.

   Neither backtracks; both run in time proportional to the segments times the program size. The DFA, its generator code (NFA builder and determinizer), and `Definition` are removed.

3. **Ambiguity is resolved by priority, in this order:** enter an optional element rather than skip it; repeat an element rather than leave it; take the earlier alternative of a choice. The effect is that a segment continues the group it is in before it starts a new enclosing one. A group occurrence that holds no segment is left out of the match.

4. **The program is compiled when a structure is loaded.** Compiling all 2,136 structures takes 15 ms (about 7 µs each), once per structure and process; emitting the programs would add 2.4 MB to the package. An invalid structure fails `compileStructure`, and the build compiles every bundled structure, so a bad structure fails the build rather than a caller.

5. **Structures are open to callers.** A structure is plain data that the published JSON Schema describes; `compileStructure` validates and compiles it, and the program works wherever a bundled one does: `runner`, `matchStructure`, and the `program` option of `@glion/lint-profile-events-segments-order`.

6. **Correctness is checked against an independent reference.** `referenceMatch`, in `scripts/check-bundle.mjs`, is a greedy backtracking parser written directly against the structure, sharing no code with the compiler or the VM; it defines the grouping semantics. `pnpm check:bundle`, the last step of the package's build, requires for every bundled structure that generated messages are accepted by the runner and grouped by `matchStructure` exactly as the reference groups them, that the two agree on near misses, that every structure file matches the JSON Schema, and that the event maps and the structure files agree. The same comparison runs as a test on 3,000 random structures (nested, repeating, nullable, and ambiguous). Checking the shipped data is the build's job; the tests cover the engine. Where a choice alternative can match nothing, a Pike VM and backtracking differ (a Pike VM never re-enters a point of the structure at the same segment; backtracking does, through an empty iteration), which is why the contract forbids such alternatives.

## Consequences

- Grouping is exact for every bundled structure under the priorities in decision 3.
- Before the DFA was removed, the new runner was checked against it on every bundled structure: over a million steps of generated messages, near misses, and truncations, every event, expected list, and acceptance matched. `lint-profile-events-segments-order` reports the same messages, apart from the #815 and #816 fixes.
- The bundled data shrinks from 20.1 MB to 6.2 MB, and a structure change is a readable JSON diff.
- Order validation costs about 0.4 µs per segment (43 µs for a 105-segment ORU_R01), against 2.7 µs for the DFA; grouping about 0.6 µs per segment. A full pipeline run costs about 90 µs per segment. If order validation ever dominates, a lazily built DFA cache inside the runner (as RE2 does) recovers DFA speed without generated data.
- `Definition`, `TransitionMap`, `NFA`, `RunnerState`, and the `effects` API are removed from `@glion/profiles`; `runner` takes a program; the lint's `definition` option becomes `program`.
- The XSDs carry at least one error the normative database does not (`TIIMING` for `TIMING` in OML_O21, OML_O33, and OML_O35, v2.5 and v2.6); moving the generator's source to the normative database, with the XSD as a cross-check, is future work.
- Cardinality rules (`lint-profile-required-groups`, `lint-profile-group-repetition`) can read `optional` and `repeating` from the same structure.

## Alternatives considered

- **Repair the `effects` table at run time** (close only open groups, open missing ancestors, report the net change). Rejected: it rebuilds a lower layer's fact from that layer's raw signals, and it cannot place a segment whose group is decided later; 121 structures stayed wrong.
- **Exact effects from a policy-aware determinizer.** States grew 12.6 %; 105 structures still committed to a group a later segment contradicts.
- **A tagged DFA** (the Pike VM compiled to a DFA with registers). Textbook tagged DFAs record the last occurrence of each group, and grouping needs every occurrence. It stays available as a benchmark-driven optimization, checked against the Pike VM.
- **Keep the DFA for order validation beside the structure.** Two representations of every structure, two engines, and a test whose only job is to prove they agree, for a speed difference under 1 % of the pipeline.
- **Generate the DFA or the programs at build time.** Keeps the data single-sourced, but emits 2.4 MB (programs) or 4.9 MB (DFAs) to save 7 µs per structure per process.
- **A backtracking parser in production.** The reference the tests use, but exponential without memoization on structures such as ORU_R01 v2.1 (`OBSERVATION` required, all its segments optional).
- **A rule instead of an errata table for the mis-flagged choices** ("a choice whose alternatives are optional is a sequence"). It catches 13 of the 18 groups; `QBP_E03`'s `<QPD | RCP>` and `EHC_E15`'s `<PMT | PYE>` are indistinguishable from genuine choices without the standard's text.

## Related

ADR 0012 (schema pipeline and validation automata); #727 (profile-driven grouping), #813 (group stack in the runner, superseded by this decision), #724 (child vs descendant addressing), #815, #816, #817; #704 and #698 (defects in the removed `effects` table).
