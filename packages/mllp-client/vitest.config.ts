import { baseConfig } from "@glion/testing";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: { name: "hl7v2-mllp-client" },
  })
);
