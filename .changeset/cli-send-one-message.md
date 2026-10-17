---
"@glion/cli": patch
---

Refuse a source that is not one message instead of putting it on the wire.

`glion send` sends one message per invocation and does not split a source into messages: where one message ends and the next begins is a framing question that belongs to whatever reads a batch — tracked in #505 — not to this command. A source is now the `invalid` outcome, with a hint, unless it is a single message: it must begin with a message header segment (`MSH`) and carry only one, and a source carrying any batch segment (`FHS`, `BHS`, `BTS`, `FTS`) is refused as the batch it is. An HL7v2 batch file used to be sent as one malformed message, because its single `MSH` is not the first segment and the delimiters were read from `FHS`.
