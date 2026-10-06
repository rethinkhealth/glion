# ADR 0023: Event Schemas as the Contract, One Engine for Order and Groups

## Status

Proposed (2026-09-19)

Supersedes the automaton part of ADR 0012: the DFA generated from the HL7 v2 schemas for segment-order validation is removed. The event schema itself is the bundled data, and one engine runs it for both segment order and segment groups.

## Context

An HL7v2 event schema is a tree. `ORU_R01` is `MSH [{SFT}] { PATIENT_RESULT: [PATIENT] { ORDER_OBSERVATION: [ORC] OBR … [{ OBSERVATION }] … } } [DSC]`: segments nested in named groups, each segment or group optional (`[ ]`), repeating (`{ }`), or both, with choices (`< A | B >`) between alternatives. The parser produces a flat list of segments. Consumers that address "the second order's third result", and the cardinality rules the lint family still lacks ("a required group is missing"), need the tree.

The generated profiles carried a DFA per schema for segment-order validation and, beside it, an `effects` table of group opens and closes keyed by DFA transition. Measured over the 2,136 bundled schemas, grouping from that table is not possible:

- **The table is inexact by construction.** Subset construction merges NFA states that sit in different groups, and each transition's closes were the difference of unions of those contexts: 142,000 closes named a group that was not open, and 607 transitions opened two sibling groups at once.
- **The grammar decides some groups only later.** In `CSU_C09`, `ORC` is the optional first segment of both `STUDY_OBSERVATION` and `STUDY_PHARM`; the next segment decides which.
- **The grammar is ambiguous.** In `ORU_R01`, an `ORC` after an `OBX` may start a new `ORDER_OBSERVATION` in the same `PATIENT_RESULT` or a new `PATIENT_RESULT` (its `PATIENT` is optional), and both readings accept the rest of the message. 89 % of the ambiguous transitions are of this kind; only a rule resolves them.

Checking the DFA against the schema it came from also exposed two defects in it: the generator read `xsd:choice` blocks as sequences (108 schemas; #815), and compiled `Hxx`, "any segment", so that a named segment could not fill it (32 schemas; #816).

Whether the schemas are always right about choices is an open question. In 18 groups of the chapter 16 and 17 schemas (`EHC_*`, `QBP_E03`, `QBP_E22`, `RSP_E03`, `RSP_E22`, `SDR_S31`, `SDR_S32`), the XML schemas and the normative database flag a group as a choice, while HAPI, generated from the database's schema notation, reads it as a sequence: `EHC_E01`'s `INVOICE_INFORMATION` is `<IVC | [PYE] | [{CTD}] … {PRODUCT_SERVICE_SECTION}>` in the schema and `IVC [PYE] [{CTD}] … {PRODUCT_SERVICE_SECTION}` in HAPI. No field in the schema or the database separates these from genuine choices such as `CCI_I22`'s `<OBR | ODS | … | PDA>`, and the standard's text has not been checked (#838).

## Decision

1. **The event schema is the contract and the only bundled data.** Each schema is one JSON file, `src/profiles/v<version>/events/<id>.json`: `segment`, `group`, and `choice` elements, each `optional` and `repeating`. The generator parses the HL7 v2 XML schemas into it and emits nothing else. It reads every `xsd:choice` as a choice, by one rule and with no per-schema exception: a member with `minOccurs="0"` makes the choice optional and the member required, which accepts the same messages (`<A? | B>` and `[<A | B>]` admit the same input) and keeps every alternative matching at least one segment. The 18 groups above therefore ship as the schemas encode them until #838 settles what the standard says; an exception for a group is added only once it is agreed and documented.

2. **One compiler, one engine.** An internal compiler turns a schema into a Thompson NFA whose epsilon edges are ordered by priority and carry group open and close actions. One function runs it: `runner(schema, segmentIds)`, a Pike VM with one thread per reading, in priority order, deduplicated by state so that the higher-priority thread wins, each carrying a log of its segments and group boundaries. It validates order and groups in one pass and returns `matched` with the groups, `mismatched` with the index of the first segment that does not fit and the segment IDs expected there, or `incomplete`. It never backtracks and runs in time proportional to the segments times the program size. A separate incremental order-only driver was measured and dropped: it is 10–23% faster per message but within noise end to end; #852 tracks whether a caller needs it. The DFA, its generator code (NFA builder and determinizer), and `Definition` are removed.

3. **Ambiguity is resolved by priority, in this order:** enter an optional element rather than skip it; repeat an element rather than leave it; take the earlier alternative of a choice. The effect is that a segment continues the group it is in before it starts a new enclosing one. A group occurrence that holds no segment is left out of the match.

4. **The program is internal, compiled per run.** Callers pass an event schema and never see its program: `runner` compiles the schema it is given on each call, and is the only code that compiles one. Compiling takes about 7 µs for ADT_A01 and 10 µs for ORU_R01, against 2 µs and 18 µs to run a 4-segment and a 25-segment message; the program is not cached, so nothing ties its lifetime to a schema object. Emitting the programs would add 2.4 MB to the package. An invalid schema throws from `runner`, and the build compiles every bundled schema, so a bad schema fails the build rather than a caller.

5. **Schemas are open to callers.** A schema is plain data that the published JSON Schema describes, and one of the caller's own works wherever a bundled one does: `runner` and the `definition` option of `@glion/lint-profile-segment-order`, which takes a schema or a function that chooses one per message.

6. **Correctness is checked against an independent reference.** `referenceMatch`, in `scripts/check-bundle.mjs`, is a greedy backtracking parser written directly against the schema, sharing no code with the compiler or the VM; it defines the grouping semantics. `pnpm check:bundle`, the last step of the package's build, requires for every bundled schema that generated messages are accepted and grouped by the runner exactly as the reference groups them, that the two agree on near misses, that every schema file matches the JSON Schema, and that the event maps and the schema files agree. The same comparison runs as a test on 3,000 random schemas (nested, repeating, nullable, and ambiguous). Checking the shipped data is the build's job; the tests cover the engine. Where a choice alternative can match nothing, a Pike VM and backtracking differ (a Pike VM never re-enters a point of the schema at the same segment; backtracking does, through an empty iteration), which is why the contract forbids such alternatives.

## Consequences

- Grouping is exact for every bundled schema under the priorities in decision 3.
- Before the DFA was removed, the new runner was checked against it on every bundled schema: over a million steps of generated messages, near misses, and truncations, every event, expected list, and acceptance matched. `lint-profile-segment-order` reports the same messages, apart from the #815 and #816 fixes.
- The bundled data shrinks from 20.1 MB to 6.2 MB, and a schema change is a readable JSON diff.
- Running a schema, order and groups together, costs about 0.5 µs per segment (52 µs for a 105-segment ORU_R01, `profiles-runner`). A full pipeline run costs about 90 µs per segment. If order validation ever dominates, a lazily built DFA cache inside the runner (as RE2 does) recovers DFA speed without generated data.
- `Definition`, `TransitionMap`, `NFA`, `RunnerState`, and the `effects` API are removed from `@glion/profiles`; `runner(schema, segmentIds)` takes an `EventSchema` and the segment IDs, and the lint's `definition` option takes an `EventSchema`.
- The XSDs carry at least one error the normative database does not (`TIIMING` for `TIMING` in OML_O21, OML_O33, and OML_O35, v2.5 and v2.6); moving the generator's source to the normative database, with the XSD as a cross-check, is future work.
- Cardinality rules (`lint-profile-required-groups`, `lint-profile-group-repetition`) can read `optional` and `repeating` from the same schema.

## Alternatives considered

- **Repair the `effects` table at run time** (close only open groups, open missing ancestors, report the net change). Rejected: it rebuilds a lower layer's fact from that layer's raw signals, and it cannot place a segment whose group is decided later; 121 schemas stayed wrong.
- **Exact effects from a policy-aware determinizer.** States grew 12.6 %; 105 schemas still committed to a group a later segment contradicts.
- **A tagged DFA** (the Pike VM compiled to a DFA with registers). Textbook tagged DFAs record the last occurrence of each group, and grouping needs every occurrence. It stays available as a benchmark-driven optimization, checked against the Pike VM.
- **Keep the DFA for order validation beside the schema.** Two representations of every schema, two engines, and a test whose only job is to prove they agree, for a speed difference under 1 % of the pipeline.
- **Generate the DFA or the programs at build time.** Keeps the data single-sourced, but emits 2.4 MB (programs) or 4.9 MB (DFAs) to save 7 µs per schema per process.
- **A backtracking parser in production.** The reference the tests use, but exponential without memoization on schemas such as ORU_R01 v2.1 (`OBSERVATION` required, all its segments optional).
- **An errata table for the 18 groups HAPI reads as sequences.** The first version of this work inlined them as sequences, on HAPI's evidence alone. Dropped so that the data follows one rule; a group is corrected once the standard's text confirms it (#838).

## Related

ADR 0012 (schema pipeline and validation automata); #727 (profile-driven grouping), #813 (group stack in the runner, superseded by this decision), #724 (child vs descendant addressing), #815, #816, #817; #704 and #698 (defects in the removed `effects` table).
