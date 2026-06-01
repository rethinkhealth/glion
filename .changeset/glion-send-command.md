---
"@glion/cli": minor
---

Add the `glion send` command — send one HL7v2 message over MLLP and print the acknowledgment. A client utility for the dev loop, alongside `glion dev` and `glion start`.

- Read the message from a file argument or stdin (omit the path, or pass `-`, to read stdin)
- Re-serialize the parsed message to canonical CR-delimited form before sending, normalizing editor line endings; the receiver decides validity and answers with a NAK
- Resolve the target from `--host`/`--port`, or from the project's `glion.config.ts` via `--local` (which override per field; a wildcard bind address maps to loopback)
- Add `--timeout`, `--json`, and `-h`/`--help` flags
- Adapt output to the destination: a human exchange view on a TTY, one JSON line when piped or with `--json`
- Exit `0` on accept (AA/CA), `1` on NAK (AE/AR/CE/CR), `2` when the message could not be delivered
- Connect over plaintext only; TLS targets are not yet supported
