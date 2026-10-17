---
"@glion/cli": minor
---

Remove `glion send --local`. The target is the one the invocation names.

`--local` was a second route to the same thing `--host`/`--port` already express, and it was the only reason the send command read a server's configuration: it took `hostname` and `port` from `glion.config.ts`, mapped a wildcard bind address to loopback, and refused a project whose port is `0` because an OS-assigned port is not in the config. All of that is gone. `glion send` is a client that sends to the system you point it at, and takes no part in what address a server of this project binds.
