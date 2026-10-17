---
"@glion/cli": minor
---

Let the command that binds decide which address to bind, instead of the config schema guessing from a mode.

`makeGlionConfigSchema` took a `mode` of `"dev"` or `"start"` for one purpose: to default `hostname` to `127.0.0.1` or `0.0.0.0`. That made every caller of `loadConfig` declare a server posture, including `glion send`, a client with no posture to declare — it passed `"dev"` because that produced loopback. The schema now leaves `hostname` as the config wrote it, `ResolvedConfig.hostname` is `string | undefined`, and `glion dev` and `glion start` each apply their own default when they build the child's manifest. `LoadConfigOptions.mode` is gone.
