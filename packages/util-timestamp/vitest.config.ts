import { baseConfig } from "@glion/testing";
import { defineConfig, mergeConfig } from "vitest/config";

// Stryker runs the tests in worker threads, which do not see a later change to
// `TZ`, so the time zone is set before any worker starts.
process.env.TZ = "America/New_York";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: { name: "hl7v2-util-timestamp" },
  })
);
