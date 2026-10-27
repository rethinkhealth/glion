import { baseConfig } from "@glion/testing";
import { defineConfig, mergeConfig } from "vitest/config";

// MSH-7 carries the host's offset from UTC, so the tests fix the host's time
// zone before any worker starts.
process.env.TZ = "America/New_York";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: "hl7v2-mllp",
    },
  })
);
