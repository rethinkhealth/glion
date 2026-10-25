import { defineConfig } from "@glion/cli/config";

export default defineConfig({
  entry: "./glion.app.ts",
  maxConnections: 1,
  port: 0,
});
