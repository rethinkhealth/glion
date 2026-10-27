---
"@glion/util-timestamp": minor
---

`nowDTM(options?)` returns the current time as a DTM that `formatDTM()` writes, with the offset from UTC of the zone it is read in: `20240115023000.123-0500`. It reads the host's time zone, or the zone in `timeZone`, an IANA name or an offset from UTC such as `-05:00`, and handles daylight saving time. `precision` cuts the value; it defaults to `fraction`, which keeps the milliseconds. A value cut to the year, month, or day is a date, written without an offset (`20240115`), unless `offset` is `true`; `offset: false` leaves the offset off a time. A `timeZone` Intl does not know throws a `RangeError`. With `timeZone: "UTC"`, in any case, the offset is written `-0000`; every other zone at offset zero, including a host whose time zone is UTC, gives `+0000`.

**Breaking:** `offset` on a TM or DTM is now the text as written, `+/-HHMM`, instead of minutes from UTC: `parseDTM("20260307-0500")` gives `offset: "-0500"`, not `-300`, and `formatDTM` writes the text as given. Its type, `Offset`, is a sign and a number, so `"Z"` and `"-05:00"` do not type-check. HL7v2 v2.9 reads `-0000` as UTC with no local time zone known and `+0000` as a local time zone at offset zero; before, both parsed to `0` and were written back as `+0000`.

**Breaking:** `Precision.Fraction` (`"fraction"`) is the precision of a TM or DTM with digits after the seconds: `parseDTM("20260307143045.12")` gives `precision: "fraction"`, not `"second"`. `fraction` is present when the precision is `fraction`, and its length is the number of digits.

**Breaking:** `formatDT`, `formatTM`, and `formatDTM` write a value from its first field down to its precision, and leave out any field past it: `{ ..., second: 45, fraction: "12", precision: "minute" }` is written without `45.12`. A value that does not give a field its precision includes, such as a `second` precision with no `minute`, throws a `TimestampPrecisionError`; before, the fields it had were written, and `0205` could be read back as 02:05.
