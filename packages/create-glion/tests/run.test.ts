import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { cancel, confirm, note, text } from "@clack/prompts";
import { downloadTemplate } from "giget";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { run } from "../src/run";

const NOT_FOUND = 404;

// The prompts answer from each test, and the download writes nothing.
vi.mock(import("@clack/prompts"), () => ({
  cancel: vi.fn(),
  confirm: vi.fn(),
  intro: vi.fn(),
  isCancel: (value: unknown): value is symbol => typeof value === "symbol",
  note: vi.fn(),
  outro: vi.fn(),
  spinner: () => ({ message: vi.fn(), start: vi.fn(), stop: vi.fn() }),
  text: vi.fn(),
}));
vi.mock(import("giget"), () => ({ downloadTemplate: vi.fn() }));

let parent: string;
let dir: string;

beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), "create-glion-"));
  dir = join(parent, "my-app");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(null)))
  );
  vi.stubEnv("npm_config_user_agent", "pnpm/10.14.0 npm/? node/v22.0.0");
});

afterEach(async () => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
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
    expect(fetch).not.toHaveBeenCalled();
    expect(downloadTemplate).not.toHaveBeenCalled();
    write.mockRestore();
  });

  it("downloads the starter into the directory given", async () => {
    await expect(run([dir])).resolves.toBe(0);
    expect(downloadTemplate).toHaveBeenCalledWith(
      "github:rethinkhealth/glion/examples/starter#main",
      { dir, force: true }
    );
  });

  it("downloads the example --example names", async () => {
    await run([dir, "--example", "mllp-server"]);
    expect(downloadTemplate).toHaveBeenCalledWith(
      "github:rethinkhealth/glion/examples/mllp-server#main",
      { dir, force: true }
    );
  });

  it("downloads the GitHub repository --example points to", async () => {
    await run([dir, "--example", "https://github.com/acme/hl7-template"]);
    expect(downloadTemplate).toHaveBeenCalledWith(
      "github:acme/hl7-template#HEAD",
      { dir, force: true }
    );
  });

  it("asks for the directory when none is given", async () => {
    vi.mocked(text).mockResolvedValue(dir);

    await expect(run([])).resolves.toBe(0);
    expect(downloadTemplate).toHaveBeenCalledWith(
      "github:rethinkhealth/glion/examples/starter#main",
      { dir, force: true }
    );
  });

  it("uses ./my-glion-app when the answer is blank", async () => {
    vi.mocked(text).mockResolvedValue("  ");

    await run([]);
    expect(downloadTemplate).toHaveBeenCalledWith(
      "github:rethinkhealth/glion/examples/starter#main",
      { dir: resolve("my-glion-app"), force: true }
    );
  });

  it("creates nothing when the directory question is cancelled", async () => {
    vi.mocked(text).mockResolvedValue(Symbol("clack:cancel"));

    await expect(run([])).resolves.toBe(0);
    expect(cancel).toHaveBeenCalledWith("Cancelled. Nothing was created.");
    expect(downloadTemplate).not.toHaveBeenCalled();
  });

  it("replaces the files in an existing folder once the user agrees", async () => {
    vi.mocked(confirm).mockResolvedValue(true);

    await expect(run([parent])).resolves.toBe(0);
    expect(confirm).toHaveBeenCalledWith({
      initialValue: false,
      message: `The folder ${parent} already exists. Replace the files in it?`,
    });
    expect(downloadTemplate).toHaveBeenCalledWith(
      "github:rethinkhealth/glion/examples/starter#main",
      { dir: parent, force: true }
    );
  });

  it("leaves an existing folder alone when the user declines", async () => {
    vi.mocked(confirm).mockResolvedValue(false);

    await expect(run([parent])).resolves.toBe(0);
    expect(cancel).toHaveBeenCalledWith("Cancelled. Nothing was created.");
    expect(downloadTemplate).not.toHaveBeenCalled();
  });

  it("leaves an existing folder alone when the question is cancelled", async () => {
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

  it("reports an example that does not exist and exits with 1", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: NOT_FOUND })))
    );

    await expect(run([dir, "--example", "no-such-example"])).resolves.toBe(1);
    expect(cancel).toHaveBeenCalledWith(
      'We could not find an example named "no-such-example". See the list of examples at https://github.com/rethinkhealth/glion/tree/main/examples.'
    );
    expect(text).not.toHaveBeenCalled();
    expect(downloadTemplate).not.toHaveBeenCalled();
  });

  it("reports a failed download and exits with 1", async () => {
    vi.mocked(downloadTemplate).mockRejectedValue(
      new Error("Failed to download https://codeload.github.com/...")
    );

    await expect(run([dir])).resolves.toBe(1);
    expect(cancel).toHaveBeenCalledWith(
      "Failed to download https://codeload.github.com/..."
    );
  });

  it("exits with 1 on an unknown option", async () => {
    await expect(run(["--template", "starter"])).resolves.toBe(1);
    expect(downloadTemplate).not.toHaveBeenCalled();
  });
});
