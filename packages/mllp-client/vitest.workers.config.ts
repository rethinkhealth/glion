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
        compatibilityDate: "2026-08-01",
        compatibilityFlags: ["nodejs_compat"],
      },
    }),
  ],
  test: {
    globalSetup: ["./tests/integration/setup.ts"],
    include: ["tests/integration/workers.test.ts"],
    name: "workerd",
  },
});
