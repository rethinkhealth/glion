import { baseConfig } from "@glion/testing";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      projects: [
        // Red: the harness is wrong. Fix it before reading `properties`.
        {
          extends: true,
          test: { include: ["tests/**/*.test.ts"], name: "harness" },
        },
        // Red: glion and the specification disagree. A finding to decide.
        {
          extends: true,
          test: {
            exclude: ["tests/**"],
            include: ["properties/**/*.prop.ts"],
            name: "properties",
          },
        },
      ],
      testTimeout: 60_000,
    },
  })
);
