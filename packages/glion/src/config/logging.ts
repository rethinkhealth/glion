/**
 * Shared logging primitives.
 *
 * This file owns the values and types that cross module boundaries:
 *
 * - `LOG_LEVELS` / `LogLevel` — the enum + TypeScript type, used by the schema
 *   (validation), the resolver (normalization), and the file logger (level
 *   filtering).
 * - `LEVEL_RANK` — numeric severity table for level comparisons.
 * - `ResolvedLogging` — the normalized shape produced by the schema's
 *   .transform() in `./schema.ts`.
 * - Default values for each resolver-applied field.
 *
 * The Zod schema and the `{ boolean | LogLevel | object → ResolvedLogging }`
 * transform live in `./schema.ts` alongside the rest of the config
 * schema — they need the same runtime context (configDir, cwd) and
 * splitting them into a separate factory was more ceremony than it
 * was worth.
 *
 * There is no `"silent"` level. Disabling file logging is done via
 * `logging: false` (or the `enabled` flag on ResolvedLogging) —
 * keeping a single mechanism for on/off rather than two equivalent
 * ones.
 */

export const LOG_LEVELS = ["debug", "info", "warn", "error", "fatal"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Numeric severity ranks. An event's level must be `>=` the
 * configured level to pass the filter. Consumed by the file logger
 * (coming in a later commit).
 */
export const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  error: 40,
  fatal: 50,
  info: 20,
  warn: 30,
};

export const DEFAULT_LOG_LEVEL: LogLevel = "info";
export const DEFAULT_MAX_LOG_FILES = 10;
/**
 * Default log directory segment, resolved against `cwd` by the schema
 * transform. Typically becomes `<cwd>/.glion/logs`, colocated with
 * `.glion/manifest.json` so all glion-owned files live under one root.
 */
export const DEFAULT_LOG_DIR_SEGMENT = ".glion/logs";
