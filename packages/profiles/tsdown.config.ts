import { defineConfig } from "tsdown";

export default defineConfig({
  clean: false,
  dts: false,
  entry: {
    "event-maps": "src/event-maps.ts",
    index: "src/index.ts",
  },
  fixedExtension: false,
  format: "esm",
  hash: false,
  outputOptions: {
    codeSplitting: {
      groups: [
        {
          maxSize: 250_000,
          minSize: 100_000,
          name: "profiles",
          test: /src\/profiles\//,
        },
      ],
    },
  },
  report: false,
  sourcemap: true,
  target: "es2022",
});
