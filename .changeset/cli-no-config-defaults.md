---
"@glion/cli": minor
---

Run a project that has no `glion.config.ts` on the defaults, as the help text and README already described.

- Discover the app at `./glion.app.ts` or `./src/glion.app.ts` when there is no config file, and run it with the schema's defaults: port `2575`, bound where each command binds by default — `127.0.0.1` under `glion dev`, `0.0.0.0` under `glion start`
- Write no `.glion/` cache directory for a send from a project that has no config, since there is nothing to compile
- Keep `config-not-found` for the one case that is still a failure: `--config` naming a file that is not there, previously reported as a compile error
