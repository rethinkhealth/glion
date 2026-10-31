---
"@glion/mllp": minor
---

Breaking: give `MllpServerError` one fixed message per `code`, held in the class. Its constructor takes the code and an optional `cause`, as in `new MllpServerError(MllpServerErrorCode.PROTOCOL_VIOLATION, { cause })`.

- Reword the `NO_PARSER` and `PROTOCOL_VIOLATION` messages.
