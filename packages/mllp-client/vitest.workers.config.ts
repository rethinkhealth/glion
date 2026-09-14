import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/**
 * `test:cf`: the Workers adapter tests, run inside `workerd`. The receivers
 * they dial are Node listeners started by `tests/runtime/workers.setup.ts`.
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
    globalSetup: ["./tests/runtime/workers.setup.ts"],
    include: ["tests/runtime/workers.test.ts"],
    name: "workerd",
  },
});
