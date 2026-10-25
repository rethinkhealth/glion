---
"@glion/mllp": minor
---

`serve()` takes `maxConnections`, the most connections the server holds open at once. A connection past it is closed as soon as it is accepted, before any message is read; an open connection is never closed to make room. Unset, the server accepts any number of connections, as before.
