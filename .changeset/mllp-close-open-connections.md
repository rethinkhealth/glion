---
"@glion/mllp": patch
---

`server.close()` resolves while a remote system holds its connection open. It stops accepting connections, ends every open connection once the message it is handling, if any, has been answered, and resolves when every connection has closed. Before, it waited for remote systems to disconnect on their own, so a shutdown hung for as long as any trading partner stayed connected.
