import { defineConfig } from "@glion/cli/config";

export default defineConfig({
  entry: "./src/app.ts",
  hostname: "127.0.0.1",
  // port 0 → OS-assigned ephemeral port; the actual port is read from
  // the `ready` event so parallel test runs don't contend on a fixed number.
  port: 0,
});
