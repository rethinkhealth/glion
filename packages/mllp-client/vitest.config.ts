import { baseConfig } from "@glion/testing";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // `tests/integration/`: `test:cf` through `vitest.workers.config.ts`.
      exclude: ["node_modules", "dist", "tests/integration/**"],
      name: "hl7v2-mllp-client",
    },
  })
);
