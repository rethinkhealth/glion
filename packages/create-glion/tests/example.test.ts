import { afterEach, describe, expect, it, vi } from "vitest";

import {
  exampleTemplate,
  gigetSource,
  githubUrl,
  resolveTemplate,
  urlTemplate,
} from "../src/example";

const NOT_FOUND = 404;
const FORBIDDEN = 403;

describe("exampleTemplate", () => {
  it("points an example name at its directory in examples/ on main", () => {
    expect(exampleTemplate("mllp-server")).toEqual({
      owner: "rethinkhealth",
      path: "examples/mllp-server",
      ref: "main",
      repo: "glion",
    });
  });

  it("refuses a name that is not a single directory name", () => {
    expect(() => exampleTemplate("../packages/mllp")).toThrow(
      'We could not find an example named "../packages/mllp". See the list of examples at https://github.com/rethinkhealth/glion/tree/main/examples.'
    );
  });

  it("refuses --example-path with an example name", () => {
    expect(() => exampleTemplate("starter", "src")).toThrow(
      "--example-path works only with a GitHub link, not with an example name."
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
});

describe("gigetSource", () => {
  it("writes a directory and its ref", () => {
    expect(
      gigetSource({
        owner: "acme",
        path: "mllp/tls",
        ref: "feat/tls",
        repo: "templates",
      })
    ).toBe("github:acme/templates/mllp/tls#feat/tls");
  });

  it("writes the root of a repository", () => {
    expect(
      gigetSource({
        owner: "acme",
        path: "",
        ref: "HEAD",
        repo: "hl7-template",
      })
    ).toBe("github:acme/hl7-template#HEAD");
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
});

describe("resolveTemplate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("finds an example by the package.json in its directory", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal("fetch", fetch);

    await expect(resolveTemplate("starter")).resolves.toEqual({
      owner: "rethinkhealth",
      path: "examples/starter",
      ref: "main",
      repo: "glion",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/rethinkhealth/glion/main/examples/starter/package.json",
      { method: "HEAD" }
    );
  });

  it("finds a repository's template on its default branch", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal("fetch", fetch);

    await resolveTemplate("https://github.com/acme/hl7-template");
    expect(fetch).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/acme/hl7-template/HEAD/package.json",
      { method: "HEAD" }
    );
  });

  it("percent-encodes each segment of a ref with a slash and its directory", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal("fetch", fetch);

    await resolveTemplate(
      "https://github.com/acme/templates/tree/feat/tls/mllp%20tls",
      "mllp tls"
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/acme/templates/feat/tls/mllp%20tls/package.json",
      { method: "HEAD" }
    );
  });

  it("refuses an example name with no directory in examples/", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: NOT_FOUND })))
    );

    await expect(resolveTemplate("no-such-example")).rejects.toThrow(
      'We could not find an example named "no-such-example". See the list of examples at https://github.com/rethinkhealth/glion/tree/main/examples.'
    );
  });

  it("refuses a directory with no package.json", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: NOT_FOUND })))
    );

    await expect(
      resolveTemplate("https://github.com/acme/templates/tree/main/docs")
    ).rejects.toThrow(
      "We could not find a template at https://github.com/acme/templates/tree/main/docs. A template is a folder with a package.json file."
    );
  });

  it("explains that GitHub cannot be reached when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("fetch failed")))
    );

    await expect(resolveTemplate("starter")).rejects.toThrow(
      "We could not reach GitHub. Check your internet connection and try again."
    );
  });

  it("reports an error answer from GitHub rather than a missing template", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: FORBIDDEN })))
    );

    await expect(resolveTemplate("starter")).rejects.toThrow(
      "GitHub returned an error (403) while looking for https://github.com/rethinkhealth/glion/tree/main/examples/starter. Please try again in a few minutes."
    );
  });
});
