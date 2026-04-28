---
"@glion/mllp-client": patch
---

Internal cleanup — remove four code smells from `@glion/mllp-client` without changing behaviour:

**1. Test fixture duplication**

`SAMPLE_ADT`, `VALID_AA`, `VALID_AE`, the MLLP byte constants, and the `frame()` helper were copy-pasted across `core.test.ts`, `node.test.ts`, `deno.test.ts`, and `workers.test.ts`. They now live in a single `test/fixtures.ts` and are imported from there. A fixture change in one place now covers every adapter.

**2. Four near-identical "swallow rejection" helpers**

`closeDuplexSafely`, `abortWriterIgnoringErrors`, `cancelReaderIgnoringErrors`, and `closeWriterIgnoringErrors` all did the same thing — `await thenable, swallow the error`. They are replaced by one shared `ignoreErrors(promise)` in `internal/ignore-errors.ts`. Two source files (`client.ts`, `exchange.ts`) reference the single helper instead of declaring local copies.

**3. Three identical per-adapter option-type aliases**

`NodeMllpClientOptions`, `DenoMllpClientOptions`, and `WorkersMllpClientOptions` were all `Omit<MllpClientOptions, "connect">`. They are replaced by one `BoundMllpClientOptions` exported from the core. Each adapter constructor now takes `BoundMllpClientOptions` directly. The shared name reflects the actual semantic ("the adapter has bound `connect` for you") and avoids three names that mean the same thing.

This is a public-API rename: callers who imported `NodeMllpClientOptions` / `DenoMllpClientOptions` / `WorkersMllpClientOptions` should switch to `BoundMllpClientOptions`. The package has not been published yet, so this is free.

**4. Verbose `InstanceType<typeof MllpClientError>` casts in tests**

Replaced with `MllpClientError` directly across `deno.test.ts` and `workers.test.ts`. The `InstanceType<>` indirection added no value.

Behaviour is identical — 37 tests still pass with no modifications, type-check is clean, lint is clean.
