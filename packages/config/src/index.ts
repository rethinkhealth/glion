/**
 * Configuration schema and loader for hl7v2.
 *
 * This package provides type-safe configuration loading for hl7v2-specific
 * settings that augment the standard unified-args configuration system.
 *
 * ## Usage
 *
 * ### Load configuration programmatically (Synchronous - Recommended)
 *
 * ```typescript
 * import { loadConfig } from "@glion/config";
 *
 * // Load full configuration
 * const config = loadConfig();
 * console.log(config.settings.delimiters); // Custom delimiter overrides
 * console.log(config.plugins); // Array of plugin configurations
 *
 * // Or destructure to get only settings
 * const { settings } = loadConfig();
 * ```
 *
 * ### Load configuration asynchronously
 *
 * ```typescript
 * import { loadConfigAsync } from "@glion/config";
 *
 * const config = await loadConfigAsync();
 * const { settings } = await loadConfigAsync();
 * ```
 *
 * ### Configuration file format
 *
 * Create a `.hl7v2rc.json` file:
 *
 * ```json
 * {
 *   "$schema": "https://raw.githubusercontent.com/rethinkhealth/hl7v2/main/packages/hl7v2-config/schema.json",
 *   "plugins": [
 *     "preset-lint-recommended"
 *   ],
 *   "settings": {
 *     "delimiters": { "field": "|" }
 *   }
 * }
 * ```
 *
 * @module @glion/config
 */

/// <reference types="unified" />

// Module augmentation to extend unified Settings interface
import type { HL7v2Settings } from "./schema";

// biome-ignore lint/performance/noBarrelFile: fine
export { defineConfig } from "./define";
export { jsonSchema } from "./json-schema";
export {
  ConfigurationError,
  clearCaches,
  loadConfig,
  loadConfigAsync,
} from "./loader";
export type { HL7v2Config, HL7v2ConfigInput, HL7v2Settings } from "./schema";
export { HL7v2ConfigSchema } from "./schema";

declare module "unified" {
  interface Settings extends HL7v2Settings {}
}
