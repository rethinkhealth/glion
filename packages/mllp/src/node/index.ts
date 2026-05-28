/**
 * Node.js runtime adapter for `@glion/mllp`.
 *
 * Import from `@glion/mllp/node` to start an MLLP
 * server on Node.js.
 *
 * @module
 * @example
 *   ```typescript
 *   import { serve } from "@glion/mllp/node";
 *   ```;
 */

// biome-ignore-all lint/performance/noBarrelFile: node subpath barrel
export { serve } from "./serve";
export type {
  ConnectionCallback,
  ErrorCallback,
  Server,
  ServeOptions,
} from "./serve";
