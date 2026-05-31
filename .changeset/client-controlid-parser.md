---
"@glion/mllp-client": patch
---

Extract the request control ID (MSH-10) via the parser instead of a hand-rolled byte scan, and document the "parsed tree for logic, caller's bytes on the wire" contract for `send()` (a `string`/`Uint8Array` is framed verbatim; a `Root` is serialized with `@glion/to-hl7v2`).
