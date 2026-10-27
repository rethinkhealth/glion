---
"@glion/util-timestamp": minor
---

`nowDTM(options?)` returns the current time as a DTM that `formatDTM()` writes, with the offset from UTC of the zone it is read in: `20240115023000.123-0500`. It reads the host's time zone, or the IANA zone in `timeZone`, and handles daylight saving time. `precision` cuts the value and drops the milliseconds. A value cut to the year, month, or day is a date, written without an offset (`20240115`), unless `offset` is `true`; `offset: false` leaves the offset off a time. An unknown `timeZone` throws Intl's `RangeError`. With `timeZone: "UTC"`, the offset is written `-0000`; every other zone at offset zero, including a host whose time zone is UTC, gives `+0000`.

**Breaking:** `offset` on a TM or DTM is now the text as written, `+/-HHMM`, instead of minutes from UTC: `parseDTM("20260307-0500")` gives `offset: "-0500"`, not `-300`, and `formatDTM` writes the text as given. HL7v2 v2.9 reads `-0000` as UTC with no local time zone known and `+0000` as a local time zone at offset zero; before, both parsed to `0` and were written back as `+0000`.
