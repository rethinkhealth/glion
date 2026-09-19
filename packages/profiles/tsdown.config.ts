import { defineConfig } from "tsdown";

// Manifests and event maps load at import, so they match neither pattern:
// a chunk holding one would load at import with all the data beside it.
const VERSION_DATA =
  /[\\/]src[\\/]profiles[\\/](v[^\\/]+)[\\/](datatypes|events|fields|tables|segments)(?:[\\/](?!manifest\.)|\.ts$)/;
const UTG_DATA = /[\\/]src[\\/]profiles[\\/]utg[\\/](?!manifest\.)/;

const dataChunk = (id: string): string | null => {
  const match = VERSION_DATA.exec(id);
  if (match) {
    const [, version, kind] = match;
    return `${kind}-${version}`;
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
  report: false,
  sourcemap: true,
  target: "es2022",
});
