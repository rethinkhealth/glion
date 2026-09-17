import { afterEach, describe, expect, it, vi } from "vitest";

import { commitDate, latestRelease } from "../src/github.mjs";

const respond = (status: number, body: unknown) =>
  vi.fn((_input: string, _init?: RequestInit) =>
    Promise.resolve(Response.json(body, { status }))
  );

describe("commitDate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the committer date as YYYY-MM-DD", async () => {
    vi.stubGlobal(
      "fetch",
      respond(200, { commit: { committer: { date: "2026-09-09T12:34:56Z" } } })
    );
    await expect(commitDate("o/r", "a".repeat(40))).resolves.toBe("2026-09-09");
  });

  it("is undefined when the repository has no such commit, whether GitHub says 404 or 422", async () => {
    vi.stubGlobal(
      "fetch",
      respond(422, { message: "No commit found for SHA" })
    );
    await expect(commitDate("o/r", "a".repeat(40))).resolves.toBeUndefined();
    vi.stubGlobal("fetch", respond(404, { message: "Not Found" }));
    await expect(commitDate("o/r", "a".repeat(40))).resolves.toBeUndefined();
  });

  it("rejects on any other failure", async () => {
    vi.stubGlobal("fetch", respond(403, { message: "rate limited" }));
    await expect(commitDate("o/r", "a".repeat(40))).rejects.toThrow(
      "GitHub API 403"
    );
  });

  it("sends the bearer token when one is given", async () => {
    const fetch = respond(200, {
      commit: { committer: { date: "2026-01-01T00:00:00Z" } },
    });
    vi.stubGlobal("fetch", fetch);
    await commitDate("o/r", "a".repeat(40), "tok");
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: "Bearer tok",
    });
  });
});

describe("latestRelease", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the release tag, or undefined when there are no releases", async () => {
    vi.stubGlobal("fetch", respond(200, { tag_name: "v2.4.4" }));
    await expect(latestRelease("o/r")).resolves.toBe("v2.4.4");
    vi.stubGlobal("fetch", respond(404, { message: "Not Found" }));
    await expect(latestRelease("o/r")).resolves.toBeUndefined();
  });
});
