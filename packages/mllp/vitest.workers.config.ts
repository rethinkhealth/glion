import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/**
 * `test:cf`: the runtime-independent core, run inside `workerd`.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        // The newest date the plugin's bundled workerd accepts. Node
        // compatibility is switched off: the core uses Web APIs only.
        compatibilityDate: "2026-08-22",
        compatibilityFlags: ["no_nodejs_compat"],
      },
    }),
  ],
  test: {
    include: ["tests/workers/**/*.test.ts"],
    name: "workerd",
  },
});
