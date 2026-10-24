import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Template } from "../src/example";
import {
  downloadFailedMessage,
  exampleTemplate,
  githubUrl,
  notFoundMessage,
  templateFor,
  urlTemplate,
} from "../src/example";

const SEPARATOR = /[/\\]/;

const isOneName = (segment: string): boolean =>
  segment !== "" &&
  segment !== "." &&
  segment !== ".." &&
  !SEPARATOR.test(segment);

// A template is drawn as an owner and a repository GitHub accepts, and a ref
// and a folder of one to four segments of any text that is one name.
const arbOwner = fc.stringMatching(/^[A-Za-z\d][A-Za-z\d-]{0,19}$/);
const arbRepo = fc
  .stringMatching(/^[\w.-]{1,20}$/)
  .filter((name) => isOneName(name) && !name.endsWith(".git"));
const arbSegment = fc
  .string({ minLength: 1, unit: "grapheme" })
  .filter(isOneName);
const arbSegments = (minLength: number) =>
  fc
    .array(arbSegment, { maxLength: 4, minLength })
    .map((segments) => segments.join("/"));
const arbTemplate = (ref: fc.Arbitrary<string>): fc.Arbitrary<Template> =>
  fc.record({ owner: arbOwner, path: arbSegments(0), ref, repo: arbRepo });

// Text after `https://github.com/`: anything, or segments mixed with the
// encodings that decode to a separator, a parent folder, or nothing valid.
const arbPathname = fc.oneof(
  fc.string({ unit: "binary" }),
  fc
    .array(
      fc.oneof(
        arbSegment,
        fc.constantFrom(
          "tree",
          "blob",
          ".",
          "..",
          "%2F",
          "..%2F..",
          "%5C",
          "%",
          "%E0%A4%A",
          "x.git",
          "..git",
          "...git"
        )
      ),
      { maxLength: 8 }
    )
    .map((segments) => segments.join("/"))
);

describe("templateFor", () => {
  it("reads an example name", () => {
    expect(templateFor("mllp-server")).toEqual(exampleTemplate("mllp-server"));
  });

  it("reads a GitHub URL", () => {
    expect(templateFor("https://github.com/acme/hl7-template")).toEqual(
      urlTemplate("https://github.com/acme/hl7-template")
    );
  });

  it("refuses an empty --example", () => {
    expect(() => templateFor("")).toThrow(
      "--example needs the name of an example or a GitHub link, and it is empty."
    );
  });

  it("refuses --example-path with an example name", () => {
    expect(() => templateFor("starter", "src")).toThrow(
      "--example-path works only with a GitHub link, not with an example name."
    );
  });

  it("never leaves examples/ for an example name", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (name) => {
        fc.pre(name !== "" && !URL.canParse(name));
        try {
          const { owner, path, ref, repo } = templateFor(name);
          const [folder, example = "", ...rest] = path.split("/");
          expect({ folder, owner, ref, repo, rest }).toEqual({
            folder: "examples",
            owner: "rethinkhealth",
            ref: "main",
            repo: "glion",
            rest: [],
          });
          expect(isOneName(example)).toBe(true);
        } catch (error: unknown) {
          expect((error as Error).message).toBe(
            `"${name}" is not the name of an example or a GitHub link. A GitHub link starts with https://github.com/.`
          );
        }
      })
    );
  });
});

describe("exampleTemplate", () => {
  it("points an example name at its directory in examples/ on main", () => {
    expect(exampleTemplate("mllp-server")).toEqual({
      name: "mllp-server",
      owner: "rethinkhealth",
      path: "examples/mllp-server",
      ref: "main",
      repo: "glion",
    });
  });

  it("refuses a name that is not a single directory name", () => {
    expect(() => exampleTemplate("../packages/mllp")).toThrow(
      '"../packages/mllp" is not the name of an example or a GitHub link. A GitHub link starts with https://github.com/.'
    );
  });

  it("refuses a GitHub address without https://", () => {
    expect(() => exampleTemplate("github.com/acme/hl7-template")).toThrow(
      '"github.com/acme/hl7-template" is not the name of an example or a GitHub link. A GitHub link starts with https://github.com/.'
    );
  });
});

describe("urlTemplate", () => {
  it("points a repository URL at the root of its default branch", () => {
    expect(urlTemplate("https://github.com/acme/hl7-template")).toEqual({
      owner: "acme",
      path: "",
      ref: "HEAD",
      repo: "hl7-template",
    });
  });

  it("reads a repository URL with a trailing slash", () => {
    expect(urlTemplate("https://github.com/acme/hl7-template/")).toEqual({
      owner: "acme",
      path: "",
      ref: "HEAD",
      repo: "hl7-template",
    });
  });

  it("reads the clone URL of a repository", () => {
    expect(urlTemplate("https://github.com/acme/hl7-template.git").repo).toBe(
      "hl7-template"
    );
  });

  it("reads www.github.com and http://", () => {
    expect(urlTemplate("https://www.github.com/acme/hl7-template").repo).toBe(
      "hl7-template"
    );
    expect(urlTemplate("http://github.com/acme/hl7-template").repo).toBe(
      "hl7-template"
    );
  });

  it("points a repository URL at --example-path on its default branch", () => {
    expect(
      urlTemplate("https://github.com/acme/templates", "/mllp/tls/")
    ).toEqual({
      owner: "acme",
      path: "mllp/tls",
      ref: "HEAD",
      repo: "templates",
    });
  });

  it("drops empty and . segments of --example-path", () => {
    expect(
      urlTemplate("https://github.com/acme/templates", "./mllp//./tls").path
    ).toBe("mllp/tls");
    expect(urlTemplate("https://github.com/acme/templates", ".").path).toBe("");
  });

  it("refuses --example-path with ..", () => {
    expect(() =>
      urlTemplate("https://github.com/acme/templates", "mllp/../..")
    ).toThrow(
      "--example-path must name a folder inside the repository, and it contains `..`."
    );
  });

  it("reads the ref and the directory from a tree URL", () => {
    expect(
      urlTemplate("https://github.com/acme/templates/tree/main/mllp/tls")
    ).toEqual({
      owner: "acme",
      path: "mllp/tls",
      ref: "main",
      repo: "templates",
    });
  });

  it("reads a tree URL that names only a ref", () => {
    expect(
      urlTemplate("https://github.com/acme/templates/tree/v1.2.0")
    ).toEqual({ owner: "acme", path: "", ref: "v1.2.0", repo: "templates" });
  });

  it("takes the ref as what precedes --example-path in a tree URL", () => {
    expect(
      urlTemplate(
        "https://github.com/acme/templates/tree/feat/tls/mllp/tls",
        "mllp/tls"
      )
    ).toEqual({
      owner: "acme",
      path: "mllp/tls",
      ref: "feat/tls",
      repo: "templates",
    });
  });

  it("takes the whole tree URL as the ref when it ends before --example-path", () => {
    expect(
      urlTemplate("https://github.com/acme/templates/tree/feat/tls", "mllp/tls")
    ).toEqual({
      owner: "acme",
      path: "mllp/tls",
      ref: "feat/tls",
      repo: "templates",
    });
  });

  it("decodes percent-encoded segments", () => {
    expect(
      urlTemplate("https://github.com/acme/templates/tree/main/mllp%20tls").path
    ).toBe("mllp tls");
  });

  it("refuses a segment that decodes to a parent folder and a slash", () => {
    const url =
      "https://github.com/rethinkhealth/glion/tree/..%2F..%2F..%2Fevil%2Fr%2Ftarball%2Fmain";
    expect(() => urlTemplate(url)).toThrow(
      `${url} does not point to a GitHub repository or a folder in one.`
    );
  });

  it("refuses a repository name that is . or .. once .git is removed", () => {
    for (const repo of ["..git", "...git"]) {
      const url = `https://github.com/acme/${repo}/tree/main`;
      expect(() => urlTemplate(url)).toThrow(
        `${url} does not point to a GitHub repository or a folder in one.`
      );
    }
  });

  it("refuses a % that starts no escape", () => {
    expect(() =>
      urlTemplate("https://github.com/acme/repo/tree/main/100%")
    ).toThrow(
      "https://github.com/acme/repo/tree/main/100% does not point to a GitHub repository or a folder in one."
    );
  });

  it("refuses an escape that is not UTF-8", () => {
    expect(() =>
      urlTemplate("https://github.com/acme/repo/tree/main/%FF")
    ).toThrow(
      "https://github.com/acme/repo/tree/main/%FF does not point to a GitHub repository or a folder in one."
    );
  });

  it("refuses a URL that is not on github.com", () => {
    expect(() => urlTemplate("https://gitlab.com/acme/hl7-template")).toThrow(
      "https://gitlab.com/acme/hl7-template is not a GitHub link. Templates can only come from GitHub."
    );
  });

  it("refuses a URL with no repository", () => {
    expect(() => urlTemplate("https://github.com/acme")).toThrow(
      "https://github.com/acme does not point to a GitHub repository or a folder in one."
    );
  });

  it("refuses a URL to a file", () => {
    expect(() =>
      urlTemplate("https://github.com/acme/templates/blob/main/README.md")
    ).toThrow(
      "https://github.com/acme/templates/blob/main/README.md does not point to a GitHub repository or a folder in one."
    );
  });

  it("reads back the page githubUrl writes, with the folder as --example-path", () => {
    fc.assert(
      fc.property(arbTemplate(arbSegments(1)), (template) => {
        expect(urlTemplate(githubUrl(template), template.path)).toEqual(
          template
        );
      })
    );
  });

  it("reads back the page githubUrl writes for a ref without a slash", () => {
    fc.assert(
      fc.property(arbTemplate(arbSegment), (template) => {
        expect(urlTemplate(githubUrl(template))).toEqual(template);
      })
    );
  });

  it("reads --example-path with empty and . segments as the folder without them", () => {
    fc.assert(
      fc.property(arbSegments(1), (path) => {
        const examplePath = `/./${path.replaceAll("/", "//./")}/`;
        expect(
          urlTemplate("https://github.com/acme/templates", examplePath).path
        ).toBe(path);
      })
    );
  });

  it("reads any github.com URL as a folder in one repository, or refuses it with its own sentence", () => {
    fc.assert(
      fc.property(arbPathname, (pathname) => {
        const url = `https://github.com/${pathname}`;
        fc.pre(URL.canParse(url));
        try {
          const { owner, path, ref, repo } = urlTemplate(url);
          const segments = [owner, repo, ...ref.split("/")];
          if (path !== "") {
            segments.push(...path.split("/"));
          }
          expect(segments.every(isOneName)).toBe(true);
        } catch (error: unknown) {
          expect((error as Error).message).toBe(
            `${url} does not point to a GitHub repository or a folder in one.`
          );
        }
      })
    );
  });
});

describe("githubUrl", () => {
  it("writes the page of a directory", () => {
    expect(
      githubUrl({
        owner: "acme",
        path: "mllp/tls",
        ref: "feat/tls",
        repo: "templates",
      })
    ).toBe("https://github.com/acme/templates/tree/feat/tls/mllp/tls");
  });

  it("writes the page of the root of a repository", () => {
    expect(
      githubUrl({ owner: "acme", path: "", ref: "HEAD", repo: "hl7-template" })
    ).toBe("https://github.com/acme/hl7-template/tree/HEAD");
  });

  it("percent-encodes each segment", () => {
    expect(
      githubUrl({ owner: "acme", path: "a#b/mllp tls", ref: "v1+1", repo: "t" })
    ).toBe("https://github.com/acme/t/tree/v1%2B1/a%23b/mllp%20tls");
  });
});

describe("notFoundMessage", () => {
  it("names the example an example name names", () => {
    expect(notFoundMessage(exampleTemplate("no-such-example"))).toBe(
      'We could not find an example named "no-such-example". See the list of examples at https://github.com/rethinkhealth/glion/tree/main/examples.'
    );
  });

  it("links the folder a URL points to", () => {
    const url = "https://github.com/acme/templates/tree/main/docs";
    expect(notFoundMessage(urlTemplate(url))).toBe(
      "We could not find a template at https://github.com/acme/templates/tree/main/docs. A template is a folder with a package.json file."
    );
  });
});

describe("downloadFailedMessage", () => {
  it("names the example an example name names", () => {
    expect(downloadFailedMessage(exampleTemplate("starter"))).toBe(
      'We could not download the example "starter". Check your internet connection and try again.'
    );
  });

  it("links the folder a URL points to and mentions --example-path", () => {
    const url = "https://github.com/acme/templates/tree/feat/tls/mllp";
    expect(downloadFailedMessage(urlTemplate(url))).toBe(
      "We could not download https://github.com/acme/templates/tree/feat/tls/mllp. Check the link and your internet connection. If the branch name contains a slash, pass the folder with --example-path."
    );
  });
});
