import { defineConfig } from "tsdown";

export default defineConfig({
  clean: false,
  deps: { neverBundle: ["cloudflare:sockets"] },
  dts: false,
  entry: {
    index: "src/index.ts",
    "runtime/node": "src/runtime/node.ts",
    "runtime/workers": "src/runtime/workers.ts",
  },
  fixedExtension: false,
  format: "esm",
  hash: false,
  sourcemap: true,
  target: "es2022",
});
