import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/**
 * `test:cf`: the Workers adapter tests, run inside `workerd`. The receivers
 * they dial are started in Node by `tests/integration/setup.ts`.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        // The newest date the plugin's bundled workerd accepts. Node
        // compatibility is on by default from 2026-08-04 and switched off
        // here: the client and the adapter use Web APIs only.
        compatibilityDate: "2026-08-22",
        compatibilityFlags: ["no_nodejs_compat"],
      },
    }),
  ],
  test: {
    globalSetup: ["./tests/integration/setup.ts"],
    include: ["tests/integration/workers.test.ts"],
    name: "workerd",
  },
});
