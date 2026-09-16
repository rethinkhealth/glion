---
"@glion/cli": minor
---

Move `glion send`'s timeouts and dial policy from the `--timeout` flag to a `client` block in `glion.config.ts`.

- Remove `--timeout`; timeouts and the dial policy are the client's defaults unless the config sets them
- Add `client` to `GlionConfig`: `connectTimeoutMs`, `sendTimeoutMs`, `maxBufferedBytes`, and `reconnect` (`{ attempts, delay }` or `false`), passed to `MllpClientOptions` as given
- Bound every `client` value to the range `@glion/mllp-client` accepts, so a value it would refuse is a config error naming the field instead of an uncaught throw
- Load the project's config on every `glion send` for its `client` block; `--config` names the file to load, before or after the `send` token
- Report a config that fails to load, and a `.glion/` cache directory that cannot be created, as the `invalid` outcome (exit 2) instead of crashing
- Create the `.glion/` cache directory where something is compiled into it, so a send from a project with no config file leaves the directory clean; `loadConfig` no longer takes a `cacheDir`
- Reject a `--port` outside 1–65535 when parsing the flag, instead of dialing a port no host can listen on
- Default `--port` to `2575`, the MLLP standard, so an explicit target needs only `--host`; the host is never assumed
