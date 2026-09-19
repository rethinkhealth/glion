import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "tsdown";

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BUILD_TIMEOUT_MS = 120_000;
const KINDS = ["datatypes", "events", "fields", "segments", "tables"];
const DATA_CHUNK =
  /^(?:(?:datatypes|events|fields|segments|tables)-v[\d.]+|utg)\.js$/;
const DATA_REGION =
  /^\/\/#region src\/profiles\/(?:v[^/]+\/(?:(?:datatypes|events|fields|tables)\/(?!manifest\.)|segments\.ts)|utg\/(?!manifest\.))/m;
const STATIC_IMPORT = /^(?:import|export)\b[^;]*?"\.\/([^"]+)"/gm;

let outDir: string;

const staticGraph = async (entry: string): Promise<Map<string, string>> => {
  const loaded = new Map<string, string>();
  const pending = [entry];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (!loaded.has(file)) {
      const code = await readFile(join(outDir, file), "utf8");
      loaded.set(file, code);
      for (const [, imported] of code.matchAll(STATIC_IMPORT)) {
        if (imported) {
          pending.push(imported);
        }
      }
    }
  }
  return loaded;
};

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), "glion-profiles-build-"));
  await build({
    config: join(PACKAGE_ROOT, "tsdown.config.ts"),
    cwd: PACKAGE_ROOT,
    logLevel: "silent",
    outDir,
    sourcemap: false,
  });
}, BUILD_TIMEOUT_MS);

afterAll(async () => {
  await rm(outDir, { force: true, recursive: true });
});

describe("@glion/profiles build", () => {
  it.each(["index.js", "event-maps.js"])(
    "loads no profile data when %s is imported",
    async (entry) => {
      const loaded = await staticGraph(entry);

      const withData = [...loaded]
        .filter(([, code]) => DATA_REGION.test(code))
        .map(([file]) => file);

      expect(withData).toEqual([]);
    }
  );

  it("emits one chunk per HL7 version and kind of profile, and one for UTG", async () => {
    const profiles = await readdir(join(PACKAGE_ROOT, "src/profiles"));
    const versions = profiles.filter((entry) => entry.startsWith("v2"));
    const expected = [
      ...versions.flatMap((version) =>
        KINDS.map((kind) => `${kind}-${version}.js`)
      ),
      "utg.js",
    ].toSorted();

    const files = await readdir(outDir);
    const chunks = files.filter((file) => DATA_CHUNK.test(file)).toSorted();

    expect(chunks).toEqual(expected);
  });

  it("loads a message structure from its version's events chunk", async () => {
    const index = await readFile(join(outDir, "index.js"), "utf8");

    expect(index).toMatch(
      /"v2\.5\/ORU_R01": \(\) => import\("\.\/events-v2\.5\.js"\)/
    );
  });
});
