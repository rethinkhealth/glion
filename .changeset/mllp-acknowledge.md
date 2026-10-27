---
"@glion/mllp": minor
---

Add `acknowledge(origin, options?)`, which builds the acknowledgment of a parsed message as an MSH and an MSA segment.

- Swap the original sender and receiver into MSH-3/4 and MSH-5/6, copying each field whole, write MSH-9 as `ACK^<trigger>^ACK` (`ACK^<trigger>` before v2.3.1), echo MSH-12.1, and echo the original MSH-10 in MSA-2
- Write MSA-1 from `code` (defaults to `AA`), and never MSA-3 or an ERR segment, so the acknowledgment has the same fields in every HL7v2 version
- Default MSH-10 to a fresh `uid()`, MSH-11 to the original message's processing ID (else `P`), and MSH-3/4 to the original MSH-5/6 unless `sending` is given
- Write MSH-1 and MSH-2 from the `delimiters` option, each delimiter not given defaulting to the standard one (`|` and `^~\&`), never from the original message
- Write MSH-7 as the current time to the second with its offset from UTC, such as `20240115023000-0500`, read in the host's time zone or the IANA zone in `timeZone`
