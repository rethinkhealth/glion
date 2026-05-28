import { defineConfig } from "@glion/cli/config";

export default defineConfig({
  entry: "./does-not-exist.ts",
  port: 0,
});
