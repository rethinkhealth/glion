# @rethinkhealth/hl7v2-util-semver

## 0.18.0

## 0.17.0

## 0.16.0

### Minor Changes

- 5e3d97e: Bump `engines.node` from `>=18` to `>=20` across all `@glion/*` packages.

  Node 18 reaches end-of-life in April 2026; new code in this repo uses
  Node 20+ APIs (notably `AbortSignal.any()` in `@glion/mllp-client`),
  and standardising on a single supported Node line keeps the
  dependency matrix coherent across the monorepo.

  Downstream impact: applications that pin Node 18 will need to upgrade
  to Node 20 or later. Node 20 is itself in active LTS and remains
  supported until April 2026; Node 22 is the current LTS.

## 0.15.3

## 0.15.2

## 0.15.1

## 0.15.0

### Patch Changes

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.

## 0.14.1

## 0.14.0

## 0.13.2

## 0.13.1

### Patch Changes

- c9fe3ee: Migrate build toolchain from tsup to tsdown
  - Switched JS bundler from tsup (esbuild) to tsdown (Rolldown) across all packages
  - `hl7v2-profiles` now uses Rolldown's `codeSplitting` to merge ~10,800 tiny chunks into ~170 larger ones, significantly improving install and build performance
  - No public API changes — this is a build internals change only

## 0.13.0

## 0.12.0

## 0.11.0

## 0.10.1

## 0.10.0

## 0.9.0

## 0.8.0

## 0.7.1

## 0.7.0

## 0.6.0

## 0.5.0

## 0.4.2

## 0.4.1

## 0.4.0

## 0.3.4

## 0.3.3

## 0.3.2

## 0.3.1

## 0.3.0

### Minor Changes

- e582209: Major refactoring for better performance, type safety, security, and error handling:

  ## Performance
  - Removed redundant `Number.isInteger()` checks in `parse()`
  - Optimized `splitTokens()` to avoid unnecessary `.filter()` calls
  - Optimized `satisfies()` to parse version once upfront
  - Simplified `compare()` function with elegant loop over fields

  ## Security & Input Validation
  - **ReDoS Protection**: Maximum input length of 100 characters for versions, 1000 for ranges
  - **Integer Overflow Protection**: Version components capped at 2^31-1 (max safe int32) for cross-platform interoperability
  - **Input Sanitization**: Comprehensive validation rejects malformed input early
  - All security validations throw descriptive `VersionParseError` or `RangeParseError`

  ## Type Safety & Error Handling (BREAKING CHANGES)

  ### Structured Error Types
  - **New exports**: `VersionParseError` and `RangeParseError` classes
  - Errors now include structured data for programmatic handling:
    ```typescript
    try {
      parse("HELLO");
    } catch (e) {
      if (e instanceof VersionParseError) {
        console.log(e.input); // "HELLO"
        console.log(e.reason); // "expected format: ..."
      }
    }
    ```

  ### Consistent Error Handling
  - **Validation functions** (never throw): `valid(input): boolean`
  - **Operation functions** (throw on invalid input): `parse()`, `clean()`, `compare()`, `satisfies()`

  **BREAKING**: `clean()` now throws instead of returning `null`:

  ```typescript
  // Before
  const result = clean("HELLO"); // returned null

  // After
  const result = clean("HELLO"); // throws VersionParseError
  // Use valid() first if you need to check:
  if (valid(input)) {
    const result = clean(input);
  }
  ```

  **BREAKING**: `satisfies()` now throws for invalid input:

  ```typescript
  satisfies("HELLO", ">=2.0"); // throws VersionParseError (was: false)
  satisfies("2.3", "INVALID"); // throws RangeParseError (was: false)
  ```

  ### Error Messages (ADR 0003 Compliance)
  - Format: `<what happened> (<where/why>) — <next step>`
  - Example: `"Invalid version format ('HELLO') — expected format: major.minor.patch (e.g., '2.5.1' or '2.3')"`
  - Provides clear context and actionable guidance

  ## New Operations

  Added essential operations found in mature semver libraries:

  ### Collection Operations
  - **`sort(versions: string[])`**: Sort versions in ascending order
  - **`maxSatisfying(versions: string[], range: string)`**: Find highest version matching a range
  - **`minSatisfying(versions: string[], range: string)`**: Find lowest version matching a range

  ### Version Manipulation
  - **`increment(version: string, release: 'major' | 'minor' | 'patch')`**: Increment a version component

  ### Version Analysis
  - **`diff(v1: string, v2: string)`**: Determine which component differs between versions

  ```typescript
  // Examples
  sort(["2.5", "2.3.1", "2.10.0"]); // => ["2.3.1", "2.5", "2.10.0"]
  maxSatisfying(["2.3", "2.5", "3.0"], ">=2.0 <3.0"); // => "2.5"
  minSatisfying(["2.3", "2.5", "3.0"], ">=2.0 <3.0"); // => "2.3"
  increment("2.5.1", "minor"); // => "2.6.0"
  diff("2.5.1", "2.6.0"); // => "minor"
  ```

  ## Architecture Improvements

  Reorganized package with modular structure for better maintainability:
  - **`types.ts`**: Type definitions and constants
  - **`errors.ts`**: Structured error classes
  - **`parse.ts`**: Version parsing and validation
  - **`compare.ts`**: Comparison operations and diff
  - **`range.ts`**: Range parsing and matching
  - **`collection.ts`**: Operations on version arrays
  - **`index.ts`**: Clean public API exports

  This separation of concerns makes the codebase easier to navigate, test, and extend.

  ## Performance Optimizations

  ### Collection Operations (O(n log n) → O(n))
  - **Optimized `maxSatisfying` and `minSatisfying`**: Removed unnecessary full array sort
  - Now find max/min directly in single pass through array
  - Significant performance improvement for large version lists

  ### Range Caching
  - **New `Range` class**: Pre-parse range expressions for reuse
  - Avoid repeated parsing overhead when checking multiple versions against same range
  - Major performance boost in hot paths

  ```typescript
  // Before: Parse range on every call
  for (const version of versions) {
    if (satisfies(version, ">=2.0 <3.0")) {
      /* ... */
    }
  }

  // After: Parse once, reuse many times (much faster)
  const range = new Range(">=2.0 <3.0");
  for (const version of versions) {
    if (satisfies(version, range)) {
      /* ... */
    }
  }

  // Also works with maxSatisfying/minSatisfying
  maxSatisfying(versions, range);
  minSatisfying(versions, range);
  ```

  **Performance characteristics:**
  - Range parsing: ~O(k) where k is number of comparators
  - `maxSatisfying`/`minSatisfying`: O(n) instead of O(n log n)
  - Range reuse: Parse once, use unlimited times with zero parsing overhead

## 0.2.31

## 0.2.30

## 0.2.29

## 0.2.28

## 0.2.27

## 0.2.26

## 0.2.25

## 0.2.24

### Patch Changes

- 8385da0: Refactored the error handling to take advantage of the `vfile` messages pattern

## 0.2.23
