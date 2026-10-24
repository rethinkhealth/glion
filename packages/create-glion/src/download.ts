import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TemplateProvider } from "giget";
import { downloadTemplate } from "giget";

import type { Template } from "./example";
import { downloadFailedMessage, githubUrl } from "./example";

const GITHUB_API = "https://api.github.com";
const GITHUB_RAW = "https://raw.githubusercontent.com";
const NOT_FOUND = 404;
const LOOKUP_TIMEOUT_MS = 5000;

const sha256 = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

/**
 * Resolves to `true` when GitHub answers that `template` has no
 * `package.json`, and to `false` for any other outcome: found, an error, no
 * answer within 5 s, or no network.
 *
 * Use it only for a template whose ref and folder hold no character a URL
 * changes, such as an example name's; {@link download} decides for every
 * template.
 */
export async function isMissing(template: Template): Promise<boolean> {
  const { owner, path, ref, repo } = template;
  const file = [
    owner,
    repo,
    ...ref.split("/"),
    ...path.split("/"),
    "package.json",
  ]
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const response = await fetch(`${GITHUB_RAW}/${file}`, {
    method: "HEAD",
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  })
    // Without an answer, the download decides, from giget's cache if offline.
    .catch(() => {});
  return response?.status === NOT_FOUND;
}

// giget's `github` provider re-parses a `owner/repo/path#ref` string, which
// cannot hold every ref or folder name. This one hands giget the template as
// it is, so giget's cache and `GIGET_AUTH` still apply. giget falls back to its
// cache file `<name>/<version>.tar.gz` when a download fails, so both are
// hashes: it writes `acme-tools/template` and `acme/tools-template` both as the
// name `acme-tools-template`, and macOS and Windows read the versions `Main` and
// `main` as one file.
function githubProvider(template: Template): TemplateProvider {
  const { owner, path, ref, repo } = template;
  const segments = [owner, repo, "tarball", ...ref.split("/")].map(
    encodeURIComponent
  );
  return () => ({
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    name: sha256(`${owner}/${repo}`),
    subdir: path,
    tar: `${GITHUB_API}/repos/${segments.join("/")}`,
    url: githubUrl(template),
    version: sha256(ref),
  });
}

/**
 * Downloads `template` into `dir`, replacing the files already there, and
 * resolves to whether `template` is a template: a folder with a
 * `package.json`.
 *
 * Writes nothing to `dir` when the download fails or resolves to `false`.
 * Copies links as they are, including a link that points outside the template.
 *
 * @throws {Error} When giget cannot download or extract the repository, with
 *   giget's error as `cause`.
 * @throws {Error} The file system's error, unchanged, when copying into `dir`
 *   fails.
 */
export async function download(
  template: Template,
  dir: string
): Promise<boolean> {
  const staging = await mkdtemp(join(tmpdir(), "create-glion-"));
  try {
    await downloadTemplate(`github:${template.owner}/${template.repo}`, {
      dir: staging,
      force: true,
      providers: { github: githubProvider(template) },
    }).catch((error: unknown) => {
      throw new Error(downloadFailedMessage(template), { cause: error });
    });
    if (!existsSync(join(staging, "package.json"))) {
      return false;
    }
    await cp(staging, dir, {
      force: true,
      recursive: true,
      verbatimSymlinks: true,
    });
    return true;
  } finally {
    await rm(staging, { force: true, recursive: true });
  }
}
