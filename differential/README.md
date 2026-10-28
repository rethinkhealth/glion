# @glion/differential

glion checked against the Lean specification of HL7v2 in [`spec/`](../spec). The specification runs as a program, the oracle, and fast-check compares glion with it on generated messages.

| Directory     | Holds                                                                                                                                                              | A failure means                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `src/`        | The oracle client (`oracle.ts`), the abstraction function from glion's tree to the specification's message (`abstraction.ts`), and the generator (`generators.ts`) |                                                                  |
| `tests/`      | Tests of `src/`, the harness                                                                                                                                       | The harness is wrong: fix it before reading `properties/`        |
| `properties/` | Claims about glion, one file per claim, each naming the Lean theorem it tests                                                                                      | glion and the specification disagree: decide which side is right |

`abstraction.ts` is trusted the way the specification's statement is: a mistake in it can hide a disagreement or invent one, so it is reviewed like a statement.

## Running

Needs the Lean toolchain (`elan`) and the `@glion/*` packages built (`pnpm build` from the root):

```sh
pnpm --filter @glion/differential test:spec
```

It builds the oracle, runs `tests/`, and runs `properties/` only when `tests/` passes. The root `pnpm test` does not run it.
