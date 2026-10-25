---
"@glion/cli": minor
---

`glion.config.ts` takes `maxConnections`, passed to `@glion/mllp`'s `serve()`: `glion start` and `glion dev` close a connection past it before reading any message from it. It must be a whole number of at least 1; unset, the server accepts any number of connections, as before.
