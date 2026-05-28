# @glion/cli

## 0.16.0

### Minor Changes

- 5e3d97e: Bump `engines.node` from `>=18` to `>=20` across all `@glion/*` packages.

  Node 18 reaches end-of-life in April 2026; new code in this repo uses
  Node 20+ APIs (notably `AbortSignal.any()` in `@glion/mllp-client`),
  and standardising on a single supported Node line keeps the
  dependency matrix coherent across the monorepo.

  Downstream impact: applications that pin Node 18 will need to upgrade
  to Node 20 or later. Node 20 is itself in active LTS and remains
  supported until April 2026; Node 22 is the current LTS.

### Patch Changes

- Updated dependencies [5e3d97e]
- Updated dependencies [5e3d97e]
  - @glion/mllp@0.16.0

## 0.15.3

### Patch Changes

- @glion/mllp@0.15.3

## 0.15.2

### Patch Changes

- @glion/mllp@0.15.2

## 0.15.1

### Patch Changes

- 3ea71c2: Fix npm sigstore provenance verification by normalizing the `repository` field in every publishable package.json to the object form with a full GitHub URL and a `directory` subpath:

  ```json
  {
    "type": "git",
    "url": "git+https://github.com/rethinkhealth/glion.git",
    "directory": "packages/<name>"
  }
  ```

  Previously, most packages used the bare string shorthand `"rethinkhealth/glion.git"`, and `@glion/annotate-delimiters` had no `repository` field at all. npm's sigstore provenance check couldn't resolve either into a URL matching the OIDC claim (`https://github.com/rethinkhealth/glion`), causing CI publish to fail with:

  ```
  E422 Unprocessable Entity - PUT https://registry.npmjs.org/@glion%2fannotate-delimiters
  Error verifying sigstore provenance bundle:
  "repository.url" is "", expected to match "https://github.com/rethinkhealth/glion" from provenance
  ```

  No runtime or API changes.
  - @glion/mllp@0.15.1

## 0.15.0

### Minor Changes

- 57bbbc9: Initial release of the `glion` package — the MLLP server dev tool, extracted from `@glion/mllp`.
  - `glion dev` runs a live TUI + file watcher with cold-restart on save.
  - `glion start` runs in production mode with JSON-line stdout for log aggregators.
  - `glion/config` subpath export: `defineConfig` helper and `GlionConfig` type for `glion.config.ts`.
  - Zero-config fallback: looks for `glion.app.ts` or `src/glion.app.ts` when no config file is present.
  - Cross-runtime: works under Node (default), Bun (`bun --bun run`), and Deno (`deno task`).
  - CLI dependencies (Ink, chokidar, jiti, cosmiconfig, React) are `optionalDependencies` — the `@glion/mllp` core package no longer carries them.

- 05c2012: Capture `console.log`, `console.info`, `console.warn`, and `console.error` as structured `log` events.
  - Add `log` event type with `level` field (`"log"` | `"info"` | `"warn"` | `"error"`) and `message` string
  - Intercept all four console methods in the child process before loading user code
  - Format arguments via `util.format` (supports `%s`, `%d`, `%j` placeholders)
  - Render log events in the TUI with level-appropriate icons (▸ log, ℹ info, ! warn, ✗ error)
  - Fix dev mode crash when autosave triggers a rebuild on a file with syntax errors — the current child keeps running and the next save retries
  - Fix orphan child processes holding the port after parent crash — child detects parent death via stdin pipe close and self-exits

- 47404f5: Security hardening, file logger, and lifecycle refinements.

  **New features**
  - Opt-in file logging — adds a polymorphic `logging` field to `GlionConfig` (`boolean | LogLevel | object`). Default is **off**; opt in with `logging: true`, `logging: "info"`, or `logging: { level, dir, maxFiles }`. When enabled, writes rotating NDJSON to `.glion/logs/` with file mode `0600` and directory mode `0700`. An announcement on stderr surfaces the filesystem side effect on first run.
  - Startup warning when `glion start` binds `0.0.0.0` without TLS — emitted as a structured `warning` event (stdout + file logger) so operators see the exposure in aggregators. HELP_TEXT gains a "Network binding" section documenting dev (127.0.0.1) vs start (0.0.0.0) defaults.
  - New `GlionErrorKind`: `"log-dir-unsafe"` — surfaces when the configured log directory is a symlink instead of a regular directory.

  **Security hardening**
  - `.glion/` cache directory now created with mode `0700` and `manifest.json` with mode `0600` — closes world-readable TLS passphrase exposure on shared hosts.
  - File-logger rotation refuses to operate when the log directory is a symlink; `lstat`-guards each matching file before `unlink` so rotation only touches regular files it could have created.
  - `config-invalid` errors no longer attach the raw `ZodError` as `cause` — defense-in-depth against Zod v4's `input` retention and enum-mismatch messages that quote received values.
  - `runHeadless` event-subscriber leak fixed — repeated `runGlion` invocations no longer accumulate dead listeners.
  - `runStart` removes its `SIGINT`/`SIGTERM` process listeners on every exit path.

  **Lifecycle correctness**
  - Child `stdin`-end self-signals `SIGTERM` instead of calling `process.exit(1)` directly — delegates to the existing graceful shutdown path so in-flight MLLP messages drain.
  - Shutdown-handler error path now emits the full `closing → error → closed → exit` triplet — downstream consumers tracking lifecycle no longer see a truncated stream when `server.close()` rejects.
  - Child unhandled rejections / uncaught exceptions are converted into structured `fatal` events before exit.
  - Parent caps child `stdout`/`stderr` line length (1 MiB default) — prevents parent OOM from a runaway child.
  - TUI log array is bounded — prevents unbounded growth under high event volume.

  **Refactors (no behavior change)**
  - Event severity is now a type-level property. A `LEVEL_BY_TYPE` table in `src/events.ts` maps each variant to its level; `eventLevel(event)` is the single function sinks call. Only the `log` variant carries an instance-level `level` field (genuinely per-instance).
  - `GlionConfig` type derives from the Zod schema via `z.input` / `z.output` — adding a field to the schema propagates to public types automatically.
  - Config schema is a context-aware factory — path resolution, mode-dependent hostname, and the `configPath` top-level field all land via Zod `.transform()` calls in a single pass.
  - `file-logger.ts` lives at `src/` root as a primitive alongside `events.ts` and `errors.ts`. The `enabled` gate lives inside `createFileLogger` — callers ask for a logger and get `null` when disabled.
  - Extracted `installShutdownHandlers`, `loadEntry`, and TLS file reading into their own modules.

  **Deferred (tracked as follow-up issues)**
  - `#577` — migrate TLS passphrase off disk entirely via `GLION_TLS_PASSPHRASE` env var.
  - `#578` — add `verbose` config field (orthogonal to log levels) for gating fatal-event stack traces.
  - `#579` — PHI-via-`console.*`-capture decision log. Current stance: caller responsibility (standard logging-library position).
  - `#580` — extract `runInteractive` / `runHeadless` into their own modules for testability.
  - `#581` — stderr ANSI/control-character sanitization. Current stance: follow ecosystem (pm2, pino, Vite, Next.js all forward raw).

### Patch Changes

- 4aa0b44: Fix telemetry middleware not capturing ACK codes when `ackMiddleware()` is used.

  The TUI displayed `?` instead of `AA`/`AE`/`AR` because the telemetry middleware was installed as the innermost middleware, causing it to read `ctx.res` before the outer `ackMiddleware` had set it. Telemetry is now prepended (outermost) so its `await next()` completes after all user middleware have run.
  - Add `{ prepend: true }` option to `Mllp.use()` for inserting middleware at the front of the chain
  - Prepend the glion telemetry middleware so it wraps ackMiddleware correctly

- 11eaf43: Replace runtime TS loading with rolldown pre-build, require config file, simplify architecture.
  - Remove `loader.ts` and runtime jiti dependency — user TS files are now compiled to `.glion/` via rolldown `transform()` (config) and `build()` (entry) before loading
  - Remove c12 dependency — config discovery uses simple file existence checks (cwd-only, no ancestor walk)
  - Require `glion.config.ts` — remove zero-config conventional entry fallback (`glion.app.ts`)
  - Remove `synthesized` field from `ResolvedConfig`
  - Remove `resolve-config.ts` — merge config resolution into `config/load.ts` as a single `loadConfig()` export
  - Add `ChildManifest` type — parent writes server options + compiled entry path to `.glion/manifest.json`, child reads it via native `import()`
  - Change `GlionSupervisorOptions` — remove `config`, add `cwd`, `gracefulCloseMs`, `manifestPath`; make `runnerPath` optional (defaults to `dist/child/runner.js`)
  - Add `fatalEvent()` to `events.ts` — shared fatal event construction, replaces duplicated inline logic
  - Reduce tsdown entry points from 7 to 4 — eliminate stub + chunk duplication in dist
  - Add `tsconfig.build.json` — prevent test `.d.ts` files from shipping in dist

- 4af9499: Rename ecosystem from `@rethinkhealth/hl7v2-*` to `@glion/*`. Drop `hl7v2-` prefix from package names (except `@glion/hl7v2`). The `@rethinkhealth/hl7v2-cli` package is removed; its functionality may return as subcommands of `glion` CLI in a future release. Old `@rethinkhealth/*` packages are deprecated with pointers to the new names. No runtime or API changes.
- Updated dependencies [4aa0b44]
- Updated dependencies [4af9499]
  - @glion/mllp@0.15.0
