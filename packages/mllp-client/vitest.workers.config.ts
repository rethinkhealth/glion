import { defineConfig } from "vitest/config";

/**
 * `test:cf`: the Workers adapter inside a real `workerd`, spawned through
 * `wrangler`.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    hookTimeout: 60_000,
    include: ["tests/workers/**/*.test.ts"],
    name: "workerd",
    testTimeout: 30_000,
  },
});
