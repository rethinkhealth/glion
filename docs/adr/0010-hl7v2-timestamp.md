# ADR: Timestamp Management in HL7v2

## Status

Accepted

## Context

HL7v2 messages use timestamps extensively across the message lifecycle: message creation (MSH-7), event recording (EVN-2), clinical observations (OBX-14), and many other fields. The HL7v2 TS (Time Stamp) data type has unique characteristics that differ from ISO 8601 and JavaScript's native `Date`:

1. **Variable precision** — timestamps can be truncated at any level (year through sub-second), and the precision carries semantic meaning. A date-only timestamp (`20260307`) is not the same as a second-precision timestamp with zeroed time (`20260307000000`).

2. **No separators** — HL7v2 concatenates all components without `T`, `:`, or `-` delimiters.

3. **4-digit fractional seconds** — HL7v2 allows `.SSSS` (4 digits), but JavaScript `Date` only stores 3 digits of millisecond precision.

4. **Timezone as suffix** — `+/-HHMM` without a colon, and only meaningful at hour precision or finer.

5. **Pipeline performance** — our unified processing pipeline handles high-throughput streaming (100K+ msg/s), so timestamp operations must minimize allocations and avoid regex overhead.

## HL7v2 Timestamp Specification

### TS (Time Stamp) Data Type

```
YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]
```

| Component  | Format                  | Example               |
| ---------- | ----------------------- | --------------------- |
| Year       | `YYYY`                  | `2026`                |
| Month      | `YYYYMM`                | `202603`              |
| Day        | `YYYYMMDD`              | `20260307`            |
| Hour       | `YYYYMMDDHH`            | `2026030714`          |
| Minute     | `YYYYMMDDHHmm`          | `202603071430`        |
| Second     | `YYYYMMDDHHmmss`        | `20260307143000`      |
| Fractional | `YYYYMMDDHHmmss.SSSS`   | `20260307143000.1234` |
| With TZ    | `YYYYMMDDHHmmss+/-ZZZZ` | `20260307143000-0500` |

### Key Differences from ISO 8601

| Aspect                      | HL7v2 TS              | ISO 8601          |
| --------------------------- | --------------------- | ----------------- |
| Separator between date/time | None (concatenated)   | `T`               |
| Timezone format             | `+/-ZZZZ` (no colon)  | `+/-HH:MM` or `Z` |
| Date separators             | None                  | `-` (hyphens)     |
| Time separators             | None                  | `:` (colons)      |
| Precision                   | Semantic (truncation) | Always full       |
| Fractional seconds          | Up to 4 digits        | Arbitrary         |

### Version Differences

- **HL7v2 2.1-2.4**: TS is a single component
- **HL7v2 2.5+**: TS became a composite type with TS.1 (Time) and TS.2 (Degree of Precision, deprecated)

In practice, TS.2 is almost never used. Our implementation treats TS as a single value regardless of version.

### Common Fields Using TS

| Field  | Description                  | Typical Precision |
| ------ | ---------------------------- | ----------------- |
| MSH-7  | Date/Time Of Message         | second            |
| EVN-2  | Recorded Date/Time           | second            |
| EVN-6  | Event Occurred               | second            |
| PID-29 | Patient Death Date and Time  | day or second     |
| OBR-7  | Observation Date/Time        | second            |
| OBX-14 | Date/Time of the Observation | second            |

## Decision

### 1. Dedicated Package: `@rethinkhealth/hl7v2-util-timestamp`

We created a standalone package rather than keeping timestamp logic in `@rethinkhealth/hl7v2-utils`. Rationale:

- **Single responsibility** — timestamp handling is complex enough to warrant its own module
- **Zero dependencies** — the package has no runtime dependencies, making it a clean leaf in the dependency graph
- **Reusability** — any package in the monorepo can depend on it without pulling in unrelated utilities

### 2. Immutable `Timestamp` Class

We chose a class with static factory methods over standalone functions:

```typescript
// API
Timestamp.from(date, { precision: "day", timezone: true });
Timestamp.parse("20260307143045-0500");
Timestamp.now({ precision: "second" });

// Instance
ts.toString(); // HL7v2 format
ts.toDate(); // JS Date copy
ts.precision; // "year" | ... | "millisecond"
ts.toDate().getTimezoneOffset(); // offset via the Date object
```

**Why a class:**

- Groups related state (date, precision, timezone, fractional raw) into a single immutable value
- Static factories (`from`, `parse`, `now`) express the three creation paths clearly
- Private constructor prevents invalid instances
- ES2022 `#` private fields (`#date`, `#offset`, `#fractionalRaw`) provide true encapsulation — the internal `Date` cannot be mutated externally

**Why not standalone functions:**

- A `formatTimestamp(date, precision, timezone)` function would need to accept and return multiple related values
- Parsing would return a bag of properties rather than a typed object
- No way to enforce immutability of the underlying Date

### 3. Precision as a First-Class Concept

Precision is tracked as a 7-level union type and preserved through all operations:

```typescript
type Precision =
  "year" | "month" | "day" | "hour" | "minute" | "second" | "millisecond";
```

**Key behaviors:**

- `Timestamp.parse("20260307").toString()` returns `"20260307"`, not `"20260307000000"`
- `Timestamp.from(date, { precision: "day" })` outputs only `YYYYMMDD`
- Timezone is only attached when precision is `"hour"` or finer (per HL7v2 spec)
- Default precision is `"second"` (the most common in HL7v2 messages)

**Representation:** We use an `as const` object with a derived union type instead of a TypeScript enum, per project conventions:

```typescript
export const Precision = {
  Day: "day",
  Hour: "hour",
  Millisecond: "millisecond",
  Minute: "minute",
  Month: "month",
  Second: "second",
  Year: "year",
} as const;

export type Precision = (typeof Precision)[keyof typeof Precision];
```

### 4. Lossless Round-Tripping

The guarantee `Timestamp.parse(str).toString() === str` holds for all valid HL7v2 timestamps. This requires special handling for fractional seconds:

- JavaScript `Date` stores only 3 digits of milliseconds, but HL7v2 allows 4
- We store the raw fractional string (e.g., `".1234"`) in a private `#fractionalRaw` field
- `toString()` uses the raw string when available, falling back to `Date.getMilliseconds()` for timestamps created via `from()` or `now()`

### 5. Performance Optimizations

The implementation is optimized for high-throughput streaming where timestamp operations occur on every message:

| Technique                        | What it replaces             | Why                                                   |
| -------------------------------- | ---------------------------- | ----------------------------------------------------- |
| `codePointAt() - 48` arithmetic  | `Number(str.substring(...))` | No substring allocation, no `Number()` coercion       |
| Pre-computed `PAD2_TABLE[0..99]` | `String(n).padStart(2, "0")` | Eliminates ~6 `padStart` calls per `toString()`       |
| `Map<Precision, number>`         | `Array.indexOf()`            | O(1) vs O(n) precision lookup                         |
| `Map<number, Precision>`         | Regex group counting         | O(1) precision detection from string length           |
| Direct string concatenation      | `array.push() + join()`      | V8 optimizes template literals into single allocation |
| No regex anywhere                | `HL7V2_TS_PATTERN.exec()`    | Eliminates match array allocation and ReDoS surface   |

### 6. Structural Validation Only

We validate that timestamps are structurally correct:

- All expected positions contain ASCII digits
- Core length is even and between 4-14
- Fractional seconds have 1-4 digits after the dot
- Timezone suffix is exactly `+/-` followed by 4 digits

We deliberately do **not** validate semantics (e.g., month `13`, day `32`, hour `25`). Rationale:

- Semantic validation belongs in the linting layer (`hl7v2-lint-*` packages)
- The `Date` constructor already normalizes overflow values (month 13 becomes next year's January)
- Rejecting semantically invalid timestamps in the parser would prevent round-tripping messages that contain such values — a real-world concern since many HL7v2 systems produce non-conformant timestamps

**Year 0-99 behavior:** JavaScript's `Date` constructor maps years 0-99 to 1900-1999 (e.g., `new Date(99, 0, 1)` produces year 1999). `Timestamp.from()` follows this convention — it takes the `Date` at face value. `Timestamp.parse()` corrects for this quirk by calling `setFullYear(year)` / `setUTCFullYear(year)` after construction, so `parse("00990307")` correctly produces year 99, not 1999. The year is always formatted as 4 zero-padded digits in `toString()` to preserve round-trip fidelity.

### 7. Timezone Design: Correct Moments and Lossless Round-Trips

Timezone handling in HL7v2 timestamps is deceptively complex. JavaScript's `Date` only stores a UTC millisecond value — it has no concept of "a time in a specific timezone." HL7v2 timestamps, on the other hand, express a local time with an explicit offset (e.g., `20260307143045-0500` means "14:30:45 in UTC-5"). Bridging these two models requires careful design to satisfy three requirements simultaneously:

1. **`toDate()` must return the correct absolute moment** — anyone doing date arithmetic, comparisons, or passing the Date to other systems must get the right instant.
2. **`toString()` must reproduce the original string exactly** — lossless round-tripping is a core guarantee.
3. **The API must not expose metadata that consumers can forget to use** — a separate `timezoneOffset` property that must be manually applied is a data integrity risk.

#### The Problem with Separate Offset Metadata

An earlier design stored the timezone offset as a public property alongside the `Date`:

```typescript
// ❌ Dangerous: consumers can forget about timezoneOffset
ts.toDate(); // Date object — but in which timezone?
ts.timezoneOffset; // 300 — must remember to apply this!
```

This is fragile. A consumer calling `ts.toDate()` gets a `Date` that looks correct but may represent the wrong moment if the offset isn't accounted for. In healthcare, a 5-hour error on a medication timestamp is clinically significant.

#### The Solution: `#offset` as Internal Formatting State

The `Timestamp` class stores the offset as a private `#offset` field with two responsibilities:

1. **Its presence signals that `toString()` should append a timezone suffix.** When `#offset` is `undefined`, no suffix is appended.
2. **It drives the UTC-to-local reconstruction in `toString()`.** The Date always stores the correct UTC instant; `#offset` tells `toString()` how to express it in the original local time.

```typescript
// The class has three private fields:
readonly #date: Date;           // correct UTC instant (source of truth)
readonly #offset?: number;      // timezone offset for formatting (internal only)
readonly #fractionalRaw?: string; // raw fractional string for round-trip
```

No public timezone property is exposed. The `Date` is the sole source of truth for computation.

#### How Parsing Works

When `parse()` encounters a timezone suffix, it constructs the `Date` using `Date.UTC()` and applies the offset to produce the correct UTC instant:

```typescript
// "20260307143045-0500" means 14:30:45 in UTC-5
// UTC instant = 14:30:45 + 5 hours = 19:30:45 UTC

const utcMs =
  Date.UTC(year, month, day, hour, minute, second, ms) + parsedOffset * 60_000;
const date = new Date(utcMs); // stores 19:30:45 UTC
// #offset = 300 (getTimezoneOffset convention: UTC-5 = +300)
```

The offset follows the `Date.getTimezoneOffset()` convention (inverted sign from HL7v2 display):

| HL7v2 suffix | Meaning  | Stored `#offset` |
| ------------ | -------- | ---------------- |
| `+0530`      | UTC+5:30 | `-330`           |
| `-0500`      | UTC-5    | `300`            |
| `+0000`      | UTC      | `0`              |

#### How Formatting Works

`toString()` must reconstruct the original local time components from the UTC instant. It does this by applying the stored offset in reverse:

```typescript
if (this.#offset === undefined) {
  // No timezone: use local getters directly
  yyyy = String(d.getFullYear());
  hh = pad2(d.getHours());
  // ...
} else {
  // Reconstruct local time at the stored offset from UTC
  const local = new Date(d.getTime() - this.#offset * 60_000);
  yyyy = String(local.getUTCFullYear());
  hh = pad2(local.getUTCHours());
  // ... then append formatOffset(this.#offset)
}
```

This produces lossless round-trips regardless of the server's timezone:

```typescript
// On ANY server (UTC, EST, PST, IST — doesn't matter):
Timestamp.parse("20260307143045-0500").toString();
// → "20260307143045-0500" (always exact)
```

#### How `from()` and `now()` Work

When creating a timestamp with `{ timezone: true }`, the offset is captured from the Date at creation time:

```typescript
const copy = new Date(date);
const offset = includeTimezone ? copy.getTimezoneOffset() : undefined;
return new Timestamp(copy, precision, offset);
```

The same `toString()` logic applies: UTC getters + stored offset → local time components. This is consistent because a Date created via `new Date(2026, 2, 7, 14, 30)` on a UTC-8 server stores `22:30 UTC` internally. Subtracting the offset (`480 minutes = 8 hours`) from UTC gives back `14:30` — the original local time.

#### Why This Design Is Uniform

All three creation paths (`parse`, `from`, `now`) produce Timestamps where:

- `#date` stores the correct UTC instant
- `#offset` (when set) tells `toString()` how to express it as local time
- `toString()` always uses `UTC getters + offset` when `#offset` is set

There is no special case for "parsed timestamps vs. created timestamps." The same formatting logic handles both, which eliminates the need for flags like `#fromUtc` and keeps the class simple.

#### Tradeoffs

| Aspect                           | Benefit                                         | Cost                                                                 |
| -------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| No public offset property        | Consumers can't misuse the Date                 | Cannot query the offset programmatically                             |
| Offset stored privately          | Lossless round-trip formatting                  | One extra field per Timestamp instance                               |
| UTC getters in `toString()`      | Server-timezone-independent output              | Creates a temporary Date per `toString()` call when offset is set    |
| Offset captured at creation time | Consistent behavior even across DST transitions | If you need to re-express in a different timezone, you must re-parse |

The temporary Date allocation in `toString()` is the only performance cost, and it only applies when a timezone suffix is present. For the majority of HL7v2 timestamps that omit timezone information, the fast path (local getters, no allocation) is used.

### 8. Defensive Copies

- `Timestamp.from(date)` copies the input Date — the caller may mutate the original
- `Timestamp.toDate()` returns a new copy each time — prevents external mutation of internal state
- `Timestamp.now()` skips the defensive copy since it creates a fresh `Date` internally (documented optimization)

## Pipeline Integration

### ACK Message Generation

The `@rethinkhealth/hl7v2-ack` package uses `Timestamp` for MSH-7 (Date/Time Of Message):

```typescript
const timestamp =
  options.timestamp instanceof Date
    ? Timestamp.from(options.timestamp).toString()
    : (options.timestamp ?? Timestamp.now().toString());
```

This supports three modes:

1. **Caller provides a `Date`** — converted via `Timestamp.from()` at default second precision
2. **Caller provides a string** — used as-is (assumed to be pre-formatted HL7v2)
3. **No timestamp provided** — `Timestamp.now()` generates current time

### Future Integration Points

- **Parser plugin** — could auto-parse TS fields in the AST into `Timestamp` instances
- **Linting rules** — semantic validation (e.g., `hl7v2-lint-timestamp-range`) using `Timestamp.parse()` for structural parsing, then checking `toDate()` for validity
- **Transformation plugins** — timezone normalization, precision adjustment

## Alternatives Considered

### 1. Use ISO 8601 Internally, Convert at Boundaries

**Rejected.** HL7v2 timestamps have semantic precision that ISO 8601 doesn't capture. Converting to ISO would lose the distinction between `"20260307"` (day precision) and `"20260307T000000"` (second precision with midnight). Round-tripping would be lossy.

### 2. Use a Third-Party Library (date-fns, luxon, dayjs)

**Rejected.** These libraries are designed for ISO 8601 and general date manipulation. They add significant bundle size, don't understand HL7v2 precision semantics, and would require adapter code that negates their value. Our needs are narrow and performance-critical.

### 3. Plain Functions Instead of a Class

**Rejected.** The timestamp concept has multiple related properties (date, precision, timezone, fractional raw) that benefit from being grouped. A class with private fields provides true encapsulation of the mutable `Date` object. Standalone functions would need to pass around a bag of properties or use a plain object without encapsulation guarantees.

### 4. Regex-Based Parsing

**Rejected.** The original implementation used a regex with 8+ capture groups. This allocates a match array and requires `Number()` conversions on every parse. Manual `codePointAt` arithmetic is 2-3x faster and eliminates the ReDoS attack surface entirely.

### 5. Semantic Validation in the Parser

**Rejected.** Rejecting timestamps like month `13` in the parser would prevent processing messages that contain such values. Real-world HL7v2 feeds frequently contain non-conformant data. Structural validation catches truly malformed strings; semantic validation belongs in the lint layer where it can produce warnings without blocking the pipeline.

## Consequences

### Positive

- **Lossless round-trip** — parse and re-serialize without information loss, including timezone
- **Correct absolute moments** — `toDate()` always returns the right UTC instant, regardless of server timezone
- **No data integrity risk** — timezone is not exposed as metadata that consumers can forget to apply
- **Precision-aware** — formatting never inflates or truncates
- **High performance** — no regex, no intermediate arrays, minimal allocations
- **Immutable** — safe to share across threads and cache
- **Zero runtime dependencies** — clean leaf package
- **Type safe** — exhaustive switch, const objects, union types
- **No ReDoS surface** — manual character parsing eliminates regex-based attacks

### Negative

- **No semantic validation** — month `13` or hour `25` are accepted structurally (mitigated by the linting layer)
- **No public timezone accessor** — the offset is internal; consumers who need the raw offset value must re-parse the string (intentional trade-off for safety)
- **Temporary Date allocation in `toString()`** — when timezone is present, `toString()` creates a temporary `Date` to reconstruct local time from UTC (only affects timezone-bearing timestamps)
- **4-digit fractional limit** — HL7v2 spec caps at 4 digits, but some non-conformant systems may send more (we reject > 4 digits)
- **`oxlint-disable` for complexity** — the `parse()` method exceeds the default complexity threshold due to inline validation; this is an intentional trade-off for performance (avoiding function call overhead in the hot path)

## References

- HL7v2 Standard, Section 2.A.79 — TS (Time Stamp) data type
- [unified](https://unifiedjs.com/) — AST processing framework used by this project
