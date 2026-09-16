import { baseConfig } from "@glion/testing";
import { defineConfig, mergeConfig } from "vitest/config";

/**
 * Unit tests, over in-memory sockets. Real sockets:
 * `vitest.integration.config.ts`.
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: ["node_modules", "dist", "tests/integration/**"],
      name: "hl7v2-mllp-client",
    },
  })
);
