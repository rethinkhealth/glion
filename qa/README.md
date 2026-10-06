# @glion/qa

Healthcare-grade QA verification for the `@glion/*` parser pipeline.

This workspace tests the distributed product as a consumer would — importing packages via `workspace:*` and verifying correctness, resilience, and performance across the full plugin chain.

## Quality Layers

| Test Suite    | File                          | What it verifies                                                                  |
| ------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| Conformance   | `tests/conformance.test.ts`   | Golden-file snapshots for all common message types and edge cases                 |
| Diagnostics   | `tests/diagnostics.test.ts`   | Exact diagnostic output for known violations (truth-table style)                  |
| Fuzz          | `tests/fuzz.test.ts`          | Parser never throws on arbitrary input (property-based)                           |
| Round-trip    | `tests/round-trip.test.ts`    | `parse(S) → serialize = S` for valid messages                                     |
| Performance   | `tests/performance.test.ts`   | Hard time thresholds at hospital-scale message volumes                            |
| Grouped trees | `tests/grouped-trees.test.ts` | Lint, annotation, and serialization read a grouped tree as they read the flat one |

## Running

```bash
# From the repo root (recommended — turbo handles build ordering):
pnpm test

# From this directory (requires packages to be built first):
pnpm test
```

Packages must be built before QA tests can run. Running `pnpm test` from the repo root handles this automatically via turbo's `"dependsOn": ["^build"]` chain. If running directly inside `qa/`, build first with `pnpm build` from the root.

## Adding Fixtures

Drop a `.hl7` file into `qa/fixtures/` — the conformance test auto-discovers it. Use these naming conventions:

- `adt-a01-*.hl7`, `oru-r01-*.hl7`, etc. — conformance corpus (valid messages)
- `edge-*.hl7` — boundary condition messages
- `invalid-*.hl7` — messages with intentional violations (consumed by diagnostics tests)

## Arbitraries

`src/arbitraries.ts` provides `fast-check` generators for property-based tests:

- `arbHL7v2Message` — structurally valid messages with default delimiters
- `arbHL7v2MessageCustomDelimiters` — valid messages with randomized delimiter sets
- `arbMutatedMessage` — valid messages with random corruption
- `arbAdversarialInput` — Unicode, null bytes, delimiter-only strings, long payloads
- `arbEventSchemaMessage(schema, version)` — messages whose segments fit an event schema
