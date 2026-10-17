---
"@glion/cli": minor
---

Report every failure as a fact, with what to do about it and the underlying error in their own channels.

- Messages state what is wrong in the user's terms: their config file, their app file, their flags. No message describes glion's own control flow ("so a target can't be derived"), names a path under `.glion/` that glion wrote for itself, or splices another system's error text into the sentence
- Report a failure loading the app against the file the user wrote, not the compiled copy beside it; the compiled path moves to the error's `context`
- Carry what to do in `hint` and the underlying error in `cause`: the `fatal` event gains both fields, `glion dev` and `glion send` print each under the message — every line of a hint that names several things to fix — and `glion send`'s JSON line gains `hint`
- Name the endpoint a pre-wire failure was aimed at on the diagnostic line, as the JSON line already did
- Report the limit a dropped line exceeded alongside the bytes dropped, instead of presenting the dropped count as the limit
- Say "the app" rather than "the child" in supervisor warnings, which describe the process model rather than what happened
- Raise the child runner's missing-manifest guard as a plain bug report instead of a `config-not-found` the operator cannot act on
