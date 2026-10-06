import { importGlobPlugin, viteJsonPlugin } from "rolldown/experimental";
import { defineConfig } from "tsdown";

// One group per version and kind, split into chunks of about
// MAX_DATA_CHUNK_SIZE bytes. The directory indexes, the event manifests, and
// the event maps match no group: a chunk holding one would load its data with
// it. Their chunk names hold no dot, which Rolldown would read as an
// extension when numbering them.
const MAX_DATA_CHUNK_SIZE = 100 * 1024;
const VERSION_DATA =
  /[\\/]src[\\/]profiles[\\/](v[^\\/]+)[\\/](?:(datatypes|fields|tables)[\\/][^\\/]+\.json|(segments)\.json)$/;
const UTG_DATA = /[\\/]src[\\/]profiles[\\/]utg[\\/][^\\/]+\.json$/;
// The event automata of a version stay one chunk, unsplit.
const EVENT_DATA =
  /[\\/]src[\\/]profiles[\\/](v[^\\/]+)[\\/]events[\\/](?!manifest\.)[^\\/]+\.ts$/;

const dataChunk = (id: string): string | null => {
  const match = VERSION_DATA.exec(id);
  if (match) {
    const [, version, kind, segments] = match;
    return `${version.replaceAll(".", "_")}-${kind ?? segments}`;
  }
  return UTG_DATA.test(id) ? "utg" : null;
};

const eventChunk = (id: string): string | null => {
  const match = EVENT_DATA.exec(id);
  return match ? `events-${match[1]}` : null;
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
      groups: [
        { maxSize: MAX_DATA_CHUNK_SIZE, name: dataChunk },
        { name: eventChunk },
      ],
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
