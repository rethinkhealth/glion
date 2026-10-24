export const EXAMPLES_URL =
  "https://github.com/rethinkhealth/glion/tree/main/examples";

const GITHUB = "https://github.com";
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const WEB_PROTOCOLS = new Set(["http:", "https:"]);
const EXAMPLE_NAME = /^[a-z0-9][\w.-]*$/i;
const GIT_SUFFIX = /\.git$/;
const SEPARATOR = /[/\\]/;

const noExampleNamed = (name: string): string =>
  `We could not find an example named "${name}". See the list of examples at ${EXAMPLES_URL}.`;

/** A directory in a GitHub repository to scaffold a project from. */
export interface Template {
  /** The example name `--example` gave; absent for a GitHub URL. */
  name?: string;
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
 * The template `--example` names: an example name ({@link exampleTemplate}) or
 * a GitHub URL ({@link urlTemplate}).
 *
 * @throws {Error} When `example` is empty or neither, or `examplePath` is given
 *   with an example name.
 */
export function templateFor(example: string, examplePath?: string): Template {
  if (example === "") {
    throw new Error(
      "--example needs the name of an example or a GitHub link, and it is empty."
    );
  }
  if (URL.canParse(example)) {
    return urlTemplate(example, examplePath);
  }
  if (examplePath !== undefined) {
    throw new Error(
      "--example-path works only with a GitHub link, not with an example name."
    );
  }
  return exampleTemplate(example);
}

/**
 * The template an example name names: `examples/<name>` in
 * `rethinkhealth/glion` on `main`.
 *
 * @throws {Error} When `name` is not a directory name.
 */
export function exampleTemplate(name: string): Template {
  if (!EXAMPLE_NAME.test(name)) {
    throw new Error(
      `"${name}" is not the name of an example or a GitHub link. A GitHub link starts with ${GITHUB}/.`
    );
  }
  return {
    name,
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
 * With `examplePath`, the URL is `https://github.com/<owner>/<repo>/tree/<ref>`
 * and `examplePath` is `<path>`, for a `<ref>` that contains a slash. Empty and
 * `.` segments of `examplePath` are dropped.
 *
 * @throws {Error} When `url` is not on github.com, is not a repository or a
 *   directory in one, or `examplePath` contains `..`.
 */
export function urlTemplate(url: string, examplePath?: string): Template {
  const { hostname, pathname, protocol } = new URL(url);
  if (!(GITHUB_HOSTS.has(hostname) && WEB_PROTOCOLS.has(protocol))) {
    throw new Error(
      `${url} is not a GitHub link. Templates can only come from GitHub.`
    );
  }

  // `github.com/<owner>/<repo>` reads as `github.com/<owner>/<repo>/tree/HEAD`.
  const [owner, repoName = "", view = "tree", ref = "HEAD", ...rest] =
    decodeSegments(pathname) ?? [];
  // `...git` loses `.git` to become `..`, so the repository is checked again.
  const repo = repoName.replace(GIT_SUFFIX, "");
  if (!(owner && repo && isName(repo)) || view !== "tree") {
    throw new Error(
      `${url} does not point to a GitHub repository or a folder in one.`
    );
  }

  if (examplePath === undefined) {
    return { owner, path: rest.join("/"), ref, repo };
  }
  const path = examplePathSegments(examplePath).join("/");
  return { owner, path, ref: [ref, ...rest].join("/"), repo };
}

// `%2F` decodes to a slash and `..%2F..` to two parent folders: each decoded
// segment must stay one name, or the template could leave the repository.
function decodeSegments(pathname: string): string[] | undefined {
  const segments = pathname.split("/").filter(Boolean).map(decodeSegment);
  return segments.every(isName) ? segments : undefined;
}

function decodeSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    // The only error decodeURIComponent throws is a URIError, for a `%` that
    // starts no UTF-8 escape, such as `100%` or `%FF`, which `new URL` keeps.
    return undefined;
  }
}

function isName(segment: string | undefined): segment is string {
  return (
    segment !== undefined &&
    segment !== "." &&
    segment !== ".." &&
    !SEPARATOR.test(segment)
  );
}

function examplePathSegments(examplePath: string): string[] {
  const segments = examplePath
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".");
  if (segments.includes("..")) {
    throw new Error(
      "--example-path must name a folder inside the repository, and it contains `..`."
    );
  }
  return segments;
}

/** The page of `template` on github.com. */
export function githubUrl({ owner, path, ref, repo }: Template): string {
  const segments = [owner, repo, "tree", ...ref.split("/"), ...path.split("/")]
    .filter(Boolean)
    .map(encodeURIComponent);
  return `${GITHUB}/${segments.join("/")}`;
}

/** The sentence that reports `template` has no `package.json`. */
export function notFoundMessage(template: Template): string {
  return template.name === undefined
    ? `We could not find a template at ${githubUrl(template)}. A template is a folder with a package.json file.`
    : noExampleNamed(template.name);
}

/** The sentence that reports `template` did not download. */
export function downloadFailedMessage(template: Template): string {
  return template.name === undefined
    ? `We could not download ${githubUrl(template)}. Check the link and your internet connection. If the branch name contains a slash, pass the folder with --example-path.`
    : `We could not download the example "${template.name}". Check your internet connection and try again.`;
}
