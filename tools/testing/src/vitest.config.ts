import { defineConfig } from "vitest/config";

// Workspace packages resolve outside node_modules, so Vitest would transform
// their builds; Node loads them as it does for consumers.
const WORKSPACE_DIST = /[\\/](?:packages|tools)[\\/][^\\/]+[\\/]dist[\\/]/;

export default defineConfig({
  test: {
    benchmark: {
      exclude: ["node_modules/**", "dist/**"],
    },
    coverage: {
      reporter: ["text", "html", "json"],
    },
    environment: "node",
    exclude: ["node_modules", "dist"],
    globals: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    server: {
      deps: {
        external: [WORKSPACE_DIST],
      },
    },
  },
});
