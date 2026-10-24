---
"@glion/cli": patch
---

Report the error a message raised in `glion dev` and `glion start`, now that `@glion/mllp` answers it with a NAK.

- Emit an `error` event with the error's message, stack, and the message's trigger after the message's `msg` event.
