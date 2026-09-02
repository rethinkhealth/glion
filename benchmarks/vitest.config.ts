import codspeedPlugin from "@codspeed/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [codspeedPlugin()],
  test: {
    benchmark: {
      exclude: ["node_modules/**"],
      include: ["suites/**/*.bench.ts"],
    },
    include: ["*.test.ts"],
  },
});
