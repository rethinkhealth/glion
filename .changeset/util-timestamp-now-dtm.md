---
"@glion/util-timestamp": minor
---

`nowDTM(options?)` returns the current time as a DTM that `formatDTM()` writes, with the offset from UTC of the zone it is read in: `20240115023000.123-0500`. It reads the host's time zone, or the IANA zone in `timeZone`, and handles daylight saving time. `precision` cuts the value and drops the milliseconds. A value cut to the year, month, or day is a date, written without an offset (`20240115`), unless `offset` is `true`; `offset: false` leaves the offset off a time. An unknown `timeZone` throws Intl's `RangeError`.
