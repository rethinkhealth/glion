import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import fc from "fast-check";
import type { DownloadTemplateOptions, TemplateInfo } from "giget";
import { downloadTemplate } from "giget";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { download } from "../src/download";
import type { Template } from "../src/example";

// giget's download writes the files a test gives it into the folder it is
// asked to extract to.
vi.mock(import("giget"), () => ({ downloadTemplate: vi.fn() }));

const STARTER: Template = {
  owner: "rethinkhealth",
  path: "examples/starter",
  ref: "main",
  repo: "glion",
};

const extracts = (files: Record<string, string>) =>
  vi.mocked(downloadTemplate).mockImplementation(async (_input, options) => {
    for (const [name, content] of Object.entries(files)) {
      const file = join(options?.dir ?? "", name);
      await mkdir(join(file, ".."), { recursive: true });
      await writeFile(file, content);
    }
    return { dir: options?.dir ?? "", name: "", source: "", tar: "" };
  });

// The template giget's provider hands back for the download it was asked for.
const providedInfo = async (): Promise<TemplateInfo> => {
  const options = vi.mocked(downloadTemplate).mock.calls[0]?.[1] as
    | DownloadTemplateOptions
    | undefined;
  const provider = options?.providers?.github;
  if (provider === undefined) {
    throw new Error("download() passed giget no github provider.");
  }
  const info = await provider("", {});
  if (info === null) {
    throw new Error("The github provider returned no template.");
  }
  return info;
};

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "create-glion-download-"));
});

afterEach(async () => {
  vi.resetAllMocks();
  await rm(dir, { force: true, recursive: true });
});

describe("download", () => {
  it("copies a folder with a package.json into the project folder", async () => {
    extracts({ "package.json": "{}", "src/app.ts": "export {};" });

    await expect(download(STARTER, dir)).resolves.toBe(true);
    expect(await readFile(join(dir, "src/app.ts"), "utf8")).toBe("export {};");
  });

  it("replaces the files already in the project folder", async () => {
    await writeFile(join(dir, "package.json"), "old");
    extracts({ "package.json": "new" });

    await download(STARTER, dir);
    expect(await readFile(join(dir, "package.json"), "utf8")).toBe("new");
  });

  it("writes nothing to the project folder when the folder has no package.json", async () => {
    extracts({ "README.md": "# Not a template" });

    await expect(download(STARTER, dir)).resolves.toBe(false);
    expect(await readdir(dir)).toEqual([]);
  });

  it("writes nothing to the project folder when the download fails", async () => {
    vi.mocked(downloadTemplate).mockRejectedValue(
      new Error("Failed to download https://api.github.com/: 404 Not Found")
    );

    await expect(download(STARTER, dir)).rejects.toThrow(
      "Failed to download https://api.github.com/: 404 Not Found"
    );
    expect(await readdir(dir)).toEqual([]);
  });

  it("removes the folder giget extracts to", async () => {
    extracts({ "package.json": "{}" });

    await download(STARTER, dir);
    const staging = vi.mocked(downloadTemplate).mock.calls[0]?.[1]?.dir ?? "";
    expect(staging).not.toBe("");
    await expect(readdir(staging)).rejects.toThrow("ENOENT");
  });

  it("asks giget for the tarball of the ref and the folder of the template", async () => {
    extracts({ "package.json": "{}" });

    await download(STARTER, dir);
    expect(await providedInfo()).toEqual({
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      name: "rethinkhealth-glion",
      subdir: "examples/starter",
      tar: "https://api.github.com/repos/rethinkhealth/glion/tarball/main",
      url: "https://github.com/rethinkhealth/glion/tree/main/examples/starter",
      version: "main",
    });
  });

  it("asks giget for exactly the template, whatever its ref and folder hold", async () => {
    const arbSegment = fc
      .string({ minLength: 1, unit: "grapheme" })
      .filter(
        (segment) =>
          !/[/\\]/.test(segment) && segment !== "." && segment !== ".."
      );
    const arbSegments = (minLength: number) =>
      fc
        .array(arbSegment, { maxLength: 4, minLength })
        .map((segments) => segments.join("/"));

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          owner: fc.stringMatching(/^[A-Za-z\d][A-Za-z\d-]{0,19}$/),
          path: arbSegments(0),
          ref: arbSegments(1),
          repo: fc.stringMatching(/^[\w-][\w.-]{0,19}$/),
        }),
        async (template) => {
          vi.mocked(downloadTemplate).mockReset();
          extracts({ "package.json": "{}" });

          await download(template, dir);
          const { subdir, tar, version } = await providedInfo();
          const tarball = new URL(String(tar)).pathname
            .split("/")
            .slice(1)
            .map(decodeURIComponent);
          expect({ subdir, tarball, version }).toEqual({
            subdir: template.path,
            tarball: [
              "repos",
              template.owner,
              template.repo,
              "tarball",
              ...template.ref.split("/"),
            ],
            version: template.ref,
          });
        }
      ),
      { numRuns: 50 }
    );
  });
});
