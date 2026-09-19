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
  // A shared chunk named after a source module, such as `errors.js`, shadows
  // that module's declaration directory for TypeScript.
  outputOptions: { chunkFileNames: "chunks/[name].js" },
  sourcemap: true,
  target: "es2022",
});
