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
        // No `nodejs_compat`: the client and the adapter use Web APIs only.
        // Dates from 2026-08-04 enable it by default; a bump must keep it off.
        compatibilityDate: "2026-08-01",
      },
    }),
  ],
  test: {
    globalSetup: ["./tests/integration/setup.ts"],
    include: ["tests/integration/workers.test.ts"],
    name: "workerd",
  },
});
