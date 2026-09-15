import { defineConfig } from "vitest/config";

/**
 * Every package's integration tests, as one run. Each package's
 * `vitest.integration.config.ts` is a project with its own setup.
 */
export default defineConfig({
  test: {
    projects: ["packages/*/vitest.integration.config.ts"],
  },
});
