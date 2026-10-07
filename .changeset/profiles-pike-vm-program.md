---
"@glion/profiles": minor
---

The runner compiles an event schema once, on its first run, and reuses the program for later runs of the same object, as RE2 and Rust's regex-automata do. A 14-segment ORU_R01 runs about 1.7 times as fast, and a 100-segment one about 1.2 times; a schema's first run costs more, once. A schema object must not change after its first run, and every schema `events.load` resolves is now frozen, at every depth: code that changed a loaded schema now throws.

A segment named `anyZSegment`, as the HL7 v2 XML schemas name the slot for a site's Z-segment in the v2.2 to v2.4 master-file and query schemas, now matches any segment ID that starts with Z, as `Hxx` matches any segment ID. Those schemas used to reject their own Z-segment with `allowZSegments: false`, and every mismatch in them listed `anyZSegment` as expected (#867).

A schema of any size runs: the runner no longer recurses, so a schema with thousands of optional elements in a row no longer overflows the call stack (#827).
