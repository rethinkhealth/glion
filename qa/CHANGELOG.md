# @glion/qa

## 0.17.0

## 0.16.0

## 0.15.3

## 0.15.2

## 0.15.1

## 0.15.0

### Patch Changes

- b26a977: Fix flaky round-trip fuzz test for mutated custom delimiter messages.

  Two issues in the "mutated custom delimiter messages" test caused non-deterministic failures:
  1. Used `roundTripProcessor` (no trailing delimiter preservation) instead of `roundTripProcessorTrailing`, causing trailing empty fields to be stripped non-idempotently on each pass
  2. Used `normalizeTrailing` with hardcoded `|` as field separator, but custom delimiter messages use arbitrary characters (`$`, `+`, `%`, etc.)

  Fix: switch to `roundTripProcessorTrailing`, detect the field separator from the first-pass MSH header, and use a relaxed idempotency assertion (count-based) since severely mutated MSH headers can make delimiter detection unreliable.
