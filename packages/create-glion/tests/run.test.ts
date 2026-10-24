import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { cancel, confirm, log, note, text } from "@clack/prompts";
import { downloadTemplate } from "giget";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { run } from "../src/run";

// The prompts answer from each test. giget's download extracts a
// package.json, or what a test gives it, into the folder it is asked for.
const progress = vi.hoisted(() => ({
  message: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}));
vi.mock(import("@clack/prompts"), () => ({
  cancel: vi.fn(),
  confirm: vi.fn(),
  intro: vi.fn(),
  isCancel: (value: unknown): value is symbol => typeof value === "symbol",
  log: { error: vi.fn() } as never,
  note: vi.fn(),
  outro: vi.fn(),
  spinner: () => progress,
  text: vi.fn(),
}));
vi.mock(import("giget"), () => ({ downloadTemplate: vi.fn() }));

const extracts = (files: Record<string, string>) =>
  vi.mocked(downloadTemplate).mockImplementation(async (_input, options) => {
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(options?.dir ?? "", name), content);
    }
    return { dir: options?.dir ?? "", name: "", source: "", tar: "" };
  });

const downloadedSource = () => vi.mocked(downloadTemplate).mock.calls[0]?.[0];

let parent: string;
let dir: string;

beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), "create-glion-"));
  dir = join(parent, "my-app");
  extracts({ "package.json": "{}" });
  vi.stubEnv("npm_config_user_agent", "pnpm/10.14.0 npm/? node/v22.0.0");
});

afterEach(async () => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(parent, { force: true, recursive: true });
});

describe("run", () => {
  it("prints the usage for --help and creates nothing", async () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await expect(run(["--help"])).resolves.toBe(0);
    expect(write).toHaveBeenCalledWith(
      expect.stringMatching(/^Usage: create-glion \[dir\] \[options\]/)
    );
    expect(downloadTemplate).not.toHaveBeenCalled();
  });

  it("creates the starter in the directory given", async () => {
    await expect(run([dir])).resolves.toBe(0);
    expect(downloadedSource()).toBe("github:rethinkhealth/glion");
    expect(await readdir(dir)).toEqual(["package.json"]);
    expect(progress.stop).toHaveBeenCalledWith(
      `Your project is ready in ${dir}.`
    );
  });

  it("creates the GitHub repository --example points to", async () => {
    await run([dir, "--example", "https://github.com/acme/hl7-template"]);
    expect(downloadedSource()).toBe("github:acme/hl7-template");
    expect(await readdir(dir)).toEqual(["package.json"]);
  });

  it("asks for the directory when none is given", async () => {
    vi.mocked(text).mockResolvedValue(dir);

    await expect(run([])).resolves.toBe(0);
    expect(await readdir(dir)).toEqual(["package.json"]);
  });

  it("uses ./my-glion-app when the answer is blank", async () => {
    vi.mocked(text).mockResolvedValue("  ");
    vi.spyOn(process, "cwd").mockReturnValue(parent);

    await run([]);
    expect(await readdir(resolve(parent, "my-glion-app"))).toEqual([
      "package.json",
    ]);
  });

  it("creates nothing when the directory question is cancelled", async () => {
    vi.mocked(text).mockResolvedValue(Symbol("clack:cancel"));

    await expect(run([])).resolves.toBe(0);
    expect(cancel).toHaveBeenCalledWith("Cancelled. Nothing was created.");
    expect(downloadTemplate).not.toHaveBeenCalled();
  });

  it("refuses an example name that cannot exist before asking anything", async () => {
    await expect(run(["--example", "../packages/mllp"])).resolves.toBe(1);
    expect(cancel).toHaveBeenCalledWith(
      '"../packages/mllp" is not the name of an example or a GitHub link. A GitHub link starts with https://github.com/.'
    );
    expect(text).not.toHaveBeenCalled();
  });

  it("refuses an empty --example before asking anything", async () => {
    await expect(run(["--example", " "])).resolves.toBe(1);
    expect(cancel).toHaveBeenCalledWith(
      "--example needs the name of an example or a GitHub link, and it is empty."
    );
    expect(text).not.toHaveBeenCalled();
  });

  it("writes into an empty folder without asking", async () => {
    await run([parent]);
    expect(confirm).not.toHaveBeenCalled();
    expect(await readdir(parent)).toEqual(["package.json"]);
  });

  it("replaces the files in a folder that has some once the user agrees", async () => {
    await writeFile(join(parent, "notes.txt"), "");
    vi.mocked(confirm).mockResolvedValue(true);

    await expect(run([parent])).resolves.toBe(0);
    expect(confirm).toHaveBeenCalledWith({
      initialValue: false,
      message: `The folder ${parent} already exists. Replace the files in it?`,
    });
    const files = await readdir(parent);
    expect(files.toSorted()).toEqual(["notes.txt", "package.json"]);
  });

  it("leaves a folder that has files alone when the user declines", async () => {
    await writeFile(join(parent, "notes.txt"), "");
    vi.mocked(confirm).mockResolvedValue(false);

    await expect(run([parent])).resolves.toBe(0);
    expect(cancel).toHaveBeenCalledWith("Cancelled. Nothing was created.");
    expect(downloadTemplate).not.toHaveBeenCalled();
  });

  it("leaves a folder that has files alone when the question is cancelled", async () => {
    await writeFile(join(parent, "notes.txt"), "");
    vi.mocked(confirm).mockResolvedValue(Symbol("clack:cancel"));

    await run([parent]);
    expect(downloadTemplate).not.toHaveBeenCalled();
  });

  it("gives the next steps with the package manager that ran it", async () => {
    await run([dir]);
    expect(note).toHaveBeenCalledWith(
      `cd ${dir}\npnpm install\n\nThen open README.md to get started.`,
      "Next steps"
    );
  });

  it("gives the next steps with npm when no package manager is known", async () => {
    vi.stubEnv("npm_config_user_agent", "");

    await run([dir]);
    expect(note).toHaveBeenCalledWith(
      `cd ${dir}\nnpm install\n\nThen open README.md to get started.`,
      "Next steps"
    );
  });

  it("reports an example that does not exist, stops the spinner, and exits with 1", async () => {
    extracts({});

    await expect(run([dir, "--example", "no-such-example"])).resolves.toBe(1);
    expect(progress.stop).toHaveBeenCalledWith("Nothing was created.", 2);
    expect(cancel).toHaveBeenCalledWith(
      'We could not find an example named "no-such-example". See the list of examples at https://github.com/rethinkhealth/glion/tree/main/examples.'
    );
    await expect(readdir(dir)).rejects.toThrow("ENOENT");
  });

  it("reports a failed download with its cause, stops the spinner, and exits with 1", async () => {
    vi.mocked(downloadTemplate).mockRejectedValue(
      new Error("Failed to download https://api.github.com/: 404 Not Found")
    );

    await expect(run([dir])).resolves.toBe(1);
    expect(progress.stop).toHaveBeenCalledWith("Nothing was created.", 2);
    expect(log.error).toHaveBeenCalledWith(
      "Failed to download https://api.github.com/: 404 Not Found"
    );
    expect(cancel).toHaveBeenCalledWith(
      'We could not download the example "starter". Check your internet connection and try again.'
    );
    await expect(readdir(dir)).rejects.toThrow("ENOENT");
  });

  it("exits with 1 on an unknown option", async () => {
    await expect(run(["--template", "starter"])).resolves.toBe(1);
    expect(downloadTemplate).not.toHaveBeenCalled();
  });
});
