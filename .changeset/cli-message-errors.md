---
"@glion/cli": patch
---

Report the error a message raised in `glion dev` and `glion start`, now that `@glion/mllp` answers it with a NAK.

- Emit an `error` event with the error's message and stack when the message raises it, before the message's `msg` event.
- Drop `trigger` from the `error` event of a connection error, which no longer comes from a message.
