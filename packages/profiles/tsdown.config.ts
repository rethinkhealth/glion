import { importGlobPlugin, viteJsonPlugin } from "rolldown/experimental";
import { defineConfig } from "tsdown";

// One group per version and kind, split into chunks of about
// MAX_DATA_CHUNK_SIZE bytes. The directory indexes and the event maps match
// no group: a chunk holding one would load its data with it. Chunk names hold
// no dot, which Rolldown would read as an extension when numbering them.
const MAX_DATA_CHUNK_SIZE = 100 * 1024;
const VERSION_DATA =
  /[\\/]src[\\/]profiles[\\/](v[^\\/]+)[\\/](?:(datatypes|events|fields|tables)[\\/][^\\/]+\.json|(segments)\.json)$/;
const UTG_DATA = /[\\/]src[\\/]profiles[\\/]utg[\\/][^\\/]+\.json$/;

const dataChunk = (id: string): string | null => {
  const match = VERSION_DATA.exec(id);
  if (match) {
    const [, version, kind, segments] = match;
    return `${version.replaceAll(".", "_")}-${kind ?? segments}`;
  }
  return UTG_DATA.test(id) ? "utg" : null;
};

export default defineConfig({
  dts: false,
  entry: {
    index: "src/index.ts",
  },
  fixedExtension: false,
  format: "esm",
  hash: false,
  outputOptions: {
    codeSplitting: {
      groups: [{ maxSize: MAX_DATA_CHUNK_SIZE, name: dataChunk }],
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
