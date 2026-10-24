export const EXAMPLES_URL =
  "https://github.com/rethinkhealth/glion/tree/main/examples";

const GITHUB = "https://github.com";
const EXAMPLE_NAME = /^[a-z0-9][\w.-]*$/i;
const EDGE_SLASHES = /^\/+|\/+$/g;
const NOT_FOUND = 404;

const noExampleNamed = (name: string): string =>
  `We could not find an example named "${name}". See the list of examples at ${EXAMPLES_URL}.`;

/** A directory in a GitHub repository to scaffold a project from. */
export interface Template {
  owner: string;
  repo: string;
  /** The branch, tag, or commit; `HEAD` for the default branch. */
  ref: string;
  /**
   * The directory in the repository, without leading or trailing slashes; empty
   * for its root.
   */
  path: string;
}

/**
 * The template an example name names: `examples/<name>` in
 * `rethinkhealth/glion` on `main`.
 *
 * @throws {Error} When `name` is not a directory name, or `examplePath` is
 *   given.
 */
export function exampleTemplate(name: string, examplePath?: string): Template {
  if (examplePath !== undefined) {
    throw new Error(
      "--example-path works only with a GitHub link, not with an example name."
    );
  }
  if (!EXAMPLE_NAME.test(name)) {
    throw new Error(noExampleNamed(name));
  }
  return {
    owner: "rethinkhealth",
    path: `examples/${name}`,
    ref: "main",
    repo: "glion",
  };
}

/**
 * The template a GitHub URL points to:
 * `https://github.com/<owner>/<repo>/tree/<ref>/<path>`, or
 * `https://github.com/<owner>/<repo>` for the root of the default branch.
 *
 * When `<ref>` contains a slash, `examplePath` is `<path>`, and the URL ends
 * with `<ref>` or `<ref>/<path>`.
 *
 * @throws {Error} When `url` is not on github.com, or is not a repository or a
 *   directory in one.
 */
export function urlTemplate(url: string, examplePath?: string): Template {
  const { origin, pathname } = new URL(url);
  if (origin !== GITHUB) {
    throw new Error(
      `${url} is not a GitHub link. Templates can only come from GitHub.`
    );
  }

  // `github.com/<owner>/<repo>` reads as `github.com/<owner>/<repo>/tree/HEAD`.
  const [owner, repo, view = "tree", ref = "HEAD", ...rest] = pathname
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  if (!owner || !repo || view !== "tree") {
    throw new Error(
      `${url} does not point to a GitHub repository or a folder in one.`
    );
  }

  if (examplePath === undefined) {
    return { owner, path: rest.join("/"), ref, repo };
  }
  const path = examplePath.replaceAll(EDGE_SLASHES, "");
  return { owner, path, ref: refBefore([ref, ...rest].join("/"), path), repo };
}

// `feat/tls/mllp/tls` before `mllp/tls` is `feat/tls`; `feat/tls` alone is `feat/tls`.
function refBefore(refAndPath: string, path: string): string {
  const suffix = `/${path}`;
  return refAndPath.endsWith(suffix)
    ? refAndPath.slice(0, -suffix.length)
    : refAndPath;
}

/** The giget source that downloads `template`. */
export function gigetSource({ owner, path, ref, repo }: Template): string {
  return `github:${owner}/${repo}${path ? `/${path}` : ""}#${ref}`;
}

/** The page of `template` on github.com. */
export function githubUrl({ owner, path, ref, repo }: Template): string {
  return `${GITHUB}/${owner}/${repo}/tree/${ref}${path ? `/${path}` : ""}`;
}

async function hasPackageJson(template: Template): Promise<boolean> {
  const { owner, path, ref, repo } = template;
  const file = [owner, repo, ...ref.split("/"), ...path.split("/")]
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const response = await fetch(
    `https://raw.githubusercontent.com/${file}/package.json`,
    { method: "HEAD" }
  ).catch((error: unknown) => {
    throw new Error(
      "We could not reach GitHub. Check your internet connection and try again.",
      { cause: error }
    );
  });
  if (response.ok) {
    return true;
  }
  if (response.status === NOT_FOUND) {
    return false;
  }
  throw new Error(
    `GitHub returned an error (${response.status}) while looking for ${githubUrl(template)}. Please try again in a few minutes.`
  );
}

/**
 * The template `--example` names, once its `package.json` is found on GitHub.
 *
 * @param example - An example name ({@link exampleTemplate}) or a GitHub URL
 *   ({@link urlTemplate}).
 * @param examplePath - The template's directory, for a URL whose ref contains a
 *   slash.
 * @throws {Error} When `example` names no template, or GitHub answers with an
 *   error.
 */
export async function resolveTemplate(
  example: string,
  examplePath?: string
): Promise<Template> {
  const isUrl = URL.canParse(example);
  const template = isUrl
    ? urlTemplate(example, examplePath)
    : exampleTemplate(example, examplePath);
  if (await hasPackageJson(template)) {
    return template;
  }
  throw new Error(
    isUrl
      ? `We could not find a template at ${githubUrl(template)}. A template is a folder with a package.json file.`
      : noExampleNamed(example)
  );
}
