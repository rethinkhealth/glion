---
"@glion/util-timestamp": minor
---

`nowDTM(options?)` returns the current time as a DTM that `formatDTM()` writes, with the offset from UTC of the zone it is read in: `20240115023000.123-0500`. It reads the host's time zone, or the IANA zone in `timeZone`, and handles daylight saving time. `precision` cuts the value and drops the milliseconds. A value cut to the year, month, or day is a date, written without an offset (`20240115`), unless `offset` is `true`; `offset: false` leaves the offset off a time. An unknown `timeZone` throws Intl's `RangeError`. In UTC (`UTC`, `Etc/UTC`, `GMT`), the offset is written `-0000`.

`parseDTM` and `parseTM` now read `-0000` as offset `-0`, and `formatDTM` and `formatTM` write `-0` back as `-0000`. HL7v2 v2.9 reads `-0000` as UTC with no local time zone known and `+0000` as a local time zone at offset zero; before, both were `0` and written `+0000`. `offset === 0` still holds for both; `Object.is(offset, -0)` tells them apart.
