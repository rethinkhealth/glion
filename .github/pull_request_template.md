## What

<!-- What changed and why. Link the issue it closes. -->

## Contract

<!-- One line: which HL7v2, MLLP, or API contract does this change protect or introduce? -->

## Checklist

See the [Testing](../CONTRIBUTING.md#testing) section of CONTRIBUTING for what each item means.

- [ ] Behaviour changes have tests in the owning package's `tests/`, mirroring `src/`.
- [ ] Any new inverse pair (encode/decode, frame/unframe, parse/format, select/set) has a fast-check round-trip property.
- [ ] A bug fix includes a regression test or `qa/fixtures/` message that fails on the parent commit.
- [ ] `pnpm check`, `pnpm check-types`, and `pnpm test` pass locally.
- [ ] For packages with a `stryker.config.mjs`, `pnpm mutate:changed` passes and each surviving mutant has a contract-named test or a documented equivalence.
- [ ] A changeset is included for any published package change.
