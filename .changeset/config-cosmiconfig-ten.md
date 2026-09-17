---
"@glion/config": minor
---

Update `cosmiconfig` to 10.0.1, which clears the four `js-yaml` advisories (GHSA-42h9-826w-cgv3 and related) reachable through `loadConfig()` and `loadConfigSync()` when a `.hl7v2rc.yaml` file is read.

- Change the supported Node.js range to `^22.18 || >=24`, inherited from `cosmiconfig` 10
- Change JSON configuration parse errors to Node's own `JSON.parse` messages
