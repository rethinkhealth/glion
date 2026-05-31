---
"@glion/cli": minor
---

feat(cli): add `glion send` — send one HL7v2 message over MLLP and print the ACK

A client utility for the dev loop, alongside `glion dev` and `glion start`. Reads
the message from a file or stdin, re-serializes it to canonical CR-delimited form,
sends it over MLLP, and reports the acknowledgment. Output is TTY-adaptive (a human
exchange view, or one JSON line when piped or with `--json`); exit codes report the
result (0 accept, 1 NAK, 2 not delivered). Target comes from `--host`/`--port`, or
from the project's `glion.config.ts` via `--local`. TLS is not yet supported.
