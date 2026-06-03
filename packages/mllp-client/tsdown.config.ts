import { defineConfig } from "tsdown";

export default defineConfig({
  clean: false,
  dts: false,
  entry: {
    index: "src/index.ts",
    node: "src/node.ts",
  },
  fixedExtension: false,
  format: "esm",
  hash: false,
  sourcemap: true,
  target: "es2022",
});
