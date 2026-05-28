import { readFileSync } from "node:fs";

import { defineConfig } from "tsdown";

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};

export default defineConfig({
  clean: false,
  define: {
    __GLION_VERSION__: JSON.stringify(pkg.version),
  },
  dts: false,
  entry: {
    "child/runner": "src/child/runner.ts",
    "config/index": "src/config/index.ts",
    index: "src/index.ts",
    run: "src/run.ts",
  },
  fixedExtension: false,
  format: "esm",
  hash: false,
  sourcemap: true,
  target: "es2022",
});
