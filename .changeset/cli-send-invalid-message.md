---
"@glion/cli": patch
---

Fix `glion send` to report a message the client could not prepare as the `invalid` outcome, as the 0.18.0 notes described (#723).

- Report a message with no MSH-10 control ID, or with a reserved MLLP byte, as `kind: "invalid"` with `code: "INVALID_MESSAGE"` and the reason on `cause` (previously `kind: "transport"`)
- Print the code and the reason on the human diagnostic line
- Identify the refused message by its control ID: `requestControlId` in JSON, `MSH-10 <id>` on the diagnostic line
- Report MSA-2 and MSA-3 of an acknowledgment as the client read them off the wire, rather than assuming MSA-2 echoes the request
