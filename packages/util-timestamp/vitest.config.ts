import { baseConfig } from "@glion/testing";
import { defineConfig, mergeConfig } from "vitest/config";

// The time zone is the process's, so it is set before any test worker starts:
// a worker thread does not see a later change to `TZ`.
process.env.TZ = "America/New_York";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: { name: "hl7v2-util-timestamp" },
  })
);
