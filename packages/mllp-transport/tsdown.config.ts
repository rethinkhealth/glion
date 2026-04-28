import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: "esm",
  sourcemap: true,
  target: "es2022",
  dts: false,
  fixedExtension: false,
  hash: false,
  clean: false,
});
