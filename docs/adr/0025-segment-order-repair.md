# ADR 0025: Read a Message That Does Not Fit as the Nearest One That Does

## Status

Proposed (2026-10-07)

Builds on ADR 0023, whose runner validates a message's segment order against its event schema, and ADR 0024, whose transform groups only a message that fits.

## Context

When a message does not fit its event schema, the runner returns the first segment that does not fit and the segment IDs the schema allows there, and `lint-profile-segment-order` reports that, in segment IDs:

| Message (v2.5)                       | Report                                                              |
| ------------------------------------ | ------------------------------------------------------------------- |
| `ORU_R01`: `MSH PID OBX OBX`         | `Unexpected segment 'OBX'. Expected: NK1, NTE, OBR, ORC, PD1, PV1`  |
| `ORU_R01`: `MSH PID OBR OBX ORC OBX` | `Unexpected segment 'OBX'. Expected: OBR`                           |
| `ADT_A01`: `MSH PID AL1`             | `Unexpected segment 'PID'. Expected: EVN, SFT`                      |
| `ORU_R01`: `MSH PID`                 | `Message ended prematurely. Expected: NK1, NTE, OBR, ORC, PD1, PV1` |

The reader has to work out that the order has no `OBR`, and a message with two problems (`ADT_A01` above lacks both `EVN` and `PV1`) reports the first. The facts a reader needs are of two kinds: a segment the schema requires is absent, or a segment is present where the schema does not allow it.

Reading an input as the nearest string a grammar accepts is minimum-distance error correction. Aho and Peterson gave it for context-free grammars in cubic time ("A minimum distance error-correcting parser for context-free languages", SIAM J. Comput. 1(4), 1972). An event schema is regular: its groups nest to a fixed depth and none holds itself, and `compile()` already makes it a Thompson NFA. For a regular language the correction takes time linear in the input (Wagner, "Order-n correction for regular languages", CACM 17(5), 1974); over an NFA it takes time proportional to the input length times the NFA size (Myers and Miller, "Approximate matching of regular expressions", Bull. Math. Biol. 51, 1989), the runner's own bound.

## Decision

1. **`repair(schema, segmentIds, options)` in `@glion/profiles` reads a message as the schema's message with the fewest edits.** An edit is a **missing** segment (the schema requires one the message does not have) or an **unexpected** segment (the message has one the schema does not allow there); each costs 1. There is no substitution: a segment in the wrong place is one missing and one unexpected, at cost 2. A segment ID names a structure, not a string with a typo, so a segment where another belongs is a different segment, not a corrupted copy of it; a malformed ID is `lint-segment-header-length`'s fact. The two kinds also map one to one onto a vfile message's fields: a missing segment sets `expected`, an unexpected one `actual`. Over the program `compile()` builds, the repair is the cheapest path over (instruction, position) from the start to `match` after the last segment: `split`, `open`, and `close` cost 0, consuming a segment that matches costs 0, moving past a segment instruction without input (a missing segment) costs 1, and consuming a segment without moving (an unexpected segment) costs 1. `repair` returns the edits in message order, and none for a message the runner matches. It takes and returns no tree: like the runner, it reads segment IDs, and an edit's `index` follows unist's child-index convention, a segment's own index, or, for a missing segment, the index it would be inserted at, as by `splice`.

2. **Equal-cost repairs are ordered by fewer unexpected segments, then by the runner's priorities** (ADR 0023, decision 3), extended to edits: at each segment, reading it as the schema expects comes first, then passing over a Z-segment, then pairing it, as unexpected, with the schema segment at that position, as missing, then a missing segment, then an unexpected one. A segment out of place is therefore reported next to the segment it displaced, as an edit-distance alignment reads a substitution: `ADT_A01` `MSH PIDX PV` reports `EVN` missing and `PIDX` unexpected, then `PID` missing and `PV` unexpected, then `PV1` missing at the end. An unexpected segment discards something the sender wrote, while a missing one only asks for more, so the reading that keeps every segment the sender wrote wins: `ORU_R01` `MSH PID OBR OBX ORC OBX` reads as an `OBR` missing from a second `ORDER_OBSERVATION`, not as an unexpected `ORC`. The search takes two passes: from the last position back to the first, each (instruction, position)'s cost to go, the cost of its cheapest path to `match`; then from the start, depth first in that order, the first path that keeps to a cheapest cost, never visiting a state twice, as the runner's threads do.

3. **Each edit carries the IDs of the groups it sits in, outermost first** (`path`): for a missing segment, the groups open where the schema requires it; for an unexpected segment, the groups of the segment before it, as a Z-segment is read in its group (ADR 0023, decision 7). These cannot be read off the tree: a message that does not fit is never grouped.

4. **A Z-segment the schema does not name is an unexpected segment that costs 0** while `allowZSegments` is on, the default, and 1 when it is `false`, so `repair` and `runner` accept the same messages under the same option.

5. **The runner is unchanged.** `repair` is a separate function over the same compiled program, so a caller that needs only the verdict does not pay for the repair. `lint-profile-segment-order` runs the runner and, on a message that does not fit, the repair.

6. **`lint-profile-segment-order` reports each edit.** The edits of a smallest repair are not consequences of one another: each is needed, and each is something the message lacks or has in excess. Each report carries its facts in the vfile message's fields as well as its text: an unexpected segment is reported with `place` its position, `ancestors` the segment's, and `actual` its ID; a missing segment with `place` a point (the start of the segment it comes before, or the end of the message), `ancestors` the nodes that hold that point, and `expected` its ID. CONTRIBUTING's lint rule 3 says "report each problem, not its consequences", which this follows.

7. **The transform still groups only a message that fits** (ADR 0024, decision 3). A repaired grouping is a reading of a message the schema rejects, not a fact about it, and `repair` does not return one.

8. **Correctness is checked against `referenceMatch`**, the backtracking parser that shares no code with the compiler (ADR 0023, decision 6), in `pnpm check:bundle` and in the engine tests on random schemas: a repair has no edits exactly when the reference accepts the message; the message with the repair applied is accepted; a repair never has more edits than were made to produce the message.

## Consequences

- `lint-profile-segment-order` names the missing segment and the groups it belongs in, or the unexpected segment and where it was read, and reports every edit: `MSH PID AL1` against `ADT_A01` reports `EVN` and `PV1` missing.
- The repair runs only on a message the runner rejects, and costs about ten times the runner: 38 µs for a 13-segment `ORU_R01` v2.5.1 missing its `OBR`, and 291 µs for 101 segments (`profiles-repair`), against 3.6 µs and 29 µs for the runner and a full pipeline of about 90 µs per segment (ADR 0023). Its cost-to-go table holds one number per instruction per position.
- A transposition reads as the cheapest edits that explain it, not as a swap: `ORU_R01` `MSH OBR PID OBX` reads as an `OBR` missing before `OBX`, since a `PATIENT_RESULT` may start without its `PATIENT`.
- A message checked against the wrong schema reports many edits: a 13-segment `ADT_A01` message read as `ORU_R01` has six.
- The cheapest repair is often not unique. The report states one reading, chosen by decision 2, and the same message always gets the same one.

## Alternatives considered

- **Keep one report per message, in the repair's words.** The first edit alone hides the others, as the first misfit does today.
- **Substitution as a third edit, at cost 1, as in Levenshtein distance.** It makes a segment in a slot as cheap as a missing segment, so the two tie where only one is true. In `MSH PID PV2` against `MSH PID PV1 [PV2]`, both "`PV1` missing" and "`PV2` in place of `PV1`" cost one edit, though `PV2` is valid where it is; counted as one edit and one unexpected segment, substitution is saved there only by the tie rule, and its reported cost no longer counts the reported edits. Reported as one fact, "`PIDX` in place of `EVN`", it would assert a pairing that only the tie order chose.
- **Missing segments before unexpected ones.** Every missing segment of a run is reported before every unexpected one: `MSH PIDX PV` reports `EVN`, `PID`, and `PV1` missing, then `PIDX` and `PV` unexpected, apart from the segments they displaced.
- **Pair a segment out of place with a schema segment of a similar ID** (`PIDX` with `PID`, `PV` with `PV1`). Reads best for a typo, but it is a heuristic over segment IDs, and dissimilar IDs would still need a rule.
- **Transposition as an edit** (Lowrance and Wagner, "An extension of the string-to-string correction problem", JACM 22(2), 1975). Left until a message needs it.
- **Carry the repair on `mismatched` and `incomplete`.** Every caller of the runner would pay for it.
- **Return the repaired message's groups with the edits.** No caller reads them while the transform groups only a message that fits (decision 7).
- **Report a missing segment on the segment it comes before.** An editor would highlight that segment as the problem; a point marks the gap.
- **One forward search, cheapest first, the first reading to reach a state winning.** A reading that made its edit at an earlier position reaches each state before one that edits at this position, so ties go to the earliest edit: `MSH` against a schema `MSH Hxx` reads as `MSH` missing and the message's `MSH` filling `Hxx`, not as `Hxx` missing at the end.
- **Place an unexpected segment where the cheapest reading resumes.** `MSH PID OBR OBX PV1 OBX` would open the second `OBSERVATION` at `PV1`; placing it after the segment before it keeps one rule for every segment the schema does not expect there.
- **Group a message the schema rejects by its repair.** Left to a later opt-in; see decision 7.
- **HAPI's forward-only placement.** One misplaced segment can move every later segment to the root (ADR 0024).

## Related

ADR 0023 (event schemas, one engine), ADR 0024 (segment groups in the tree), ADR 0003 (lint diagnostic style); #869 (this decision), #868 (Z-segments in the runner), #840 (conformance profiles).
