import { baseConfig } from "@glion/testing";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        // `scripts/` is build tooling, not shipped source: the bundle check
        // runs in `pnpm build`, over every bundled structure.
        exclude: ["scripts/**", "src/profiles/**"],
      },
      name: "hl7-profiles",
    },
  })
);
