// Lab sweeps run locally in wall time — no CodSpeed instrumentation.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    benchmark: {
      exclude: ["node_modules/**"],
      include: ["lab/**/*.bench.ts"],
    },
  },
});
