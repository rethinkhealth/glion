/**
 * Public entry for `glion/config`.
 *
 * Users import `defineConfig` here and export its return value as the
 * default export of their `glion.config.ts`. `defineConfig` is an
 * identity function at runtime; its only purpose is to give TypeScript
 * inference over the config shape without requiring an explicit type
 * annotation.
 *
 * This file is a thin public-surface shim — the schema factory AND
 * the TypeScript types it owns both live in `./schema.ts` so there's
 * one source of truth. Nothing here imports Zod directly; when a new
 * field is added to the schema it flows through automatically via
 * `z.input`.
 */

import type { GlionConfig } from "./schema.js";

export type { GlionConfig } from "./schema.js";

/**
 * Identity helper for type inference. Use in your `glion.config.ts`:
 *
 * ```ts
 * import { defineConfig } from "@glion/cli/config";
 * export default defineConfig({
 *   entry: "./src/app.ts",
 *   port: 2575,
 * });
 * ```
 */
export function defineConfig(config: GlionConfig): GlionConfig {
  return config;
}
