import { importGlobPlugin, viteJsonPlugin } from "rolldown/experimental";
import { defineConfig } from "tsdown";

// One lazy chunk per bundled data file. The event maps load at import, so they
// match neither pattern and stay in the entry chunk.
const VERSION_DATA =
  /[\\/]src[\\/]profiles[\\/]v([^\\/]+)[\\/](datatypes|fields|segments|structures|tables)\.json$/;
const UTG_DATA = /[\\/]src[\\/]profiles[\\/]utg[\\/]code-systems\.json$/;

const dataChunk = (id: string): string | null => {
  const match = VERSION_DATA.exec(id);
  if (match) {
    const [, version, kind] = match;
    return `${kind}-v${version}`;
  }
  return UTG_DATA.test(id) ? "utg" : null;
};

export default defineConfig({
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
      groups: [{ name: dataChunk }],
    },
  },
  // `JSON.parse` of a minified string parses faster than the same data as an
  // object literal.
  plugins: [
    importGlobPlugin(),
    viteJsonPlugin({ minify: true, stringify: true }),
  ],
  report: false,
  sourcemap: true,
  target: "es2022",
});
