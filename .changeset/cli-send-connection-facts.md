---
"@glion/cli": patch
---

Report the connection's facts in `glion send`'s terminal view: a `== connected` line with the time the dial took, and a `== closed` line with the client's error code when an open connection is lost. Both go to stderr and are absent under `--json`.
