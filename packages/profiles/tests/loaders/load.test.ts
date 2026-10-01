import { loaderByVersion, versionAndId } from "../../src/loaders/load";

const manifest = {
  "v2.5/BAR": () => Promise.resolve("bar"),
  "v2.5/FOO": () => Promise.resolve("foo"),
  "v2.6/FOO": () => Promise.resolve("foo 2.6"),
};

describe("loaderByVersion", () => {
  it("compiles every profile of the version, by id", async () => {
    const load = loaderByVersion(manifest, versionAndId, (raw: string) =>
      raw.toUpperCase()
    );

    expect(await load("2.5")).toEqual(
      new Map([
        ["BAR", "BAR"],
        ["FOO", "FOO"],
      ])
    );
    expect(await load("2.6")).toEqual(new Map([["FOO", "FOO 2.6"]]));
  });

  it("resolves undefined for a version the manifest holds nothing for", async () => {
    const load = loaderByVersion(manifest, versionAndId, (raw: string) => raw);

    expect(await load("2.7")).toBeUndefined();
  });

  it("compiles each version once", async () => {
    const compile = vi.fn((raw: string) => raw);
    const load = loaderByVersion(manifest, versionAndId, compile);

    const [first, second] = await Promise.all([load("2.5"), load("2.5")]);

    expect(first).toBe(second);
    expect(compile).toHaveBeenCalledTimes(2);
  });
});

describe("versionAndId", () => {
  it("reads the version and id of a manifest key", () => {
    expect(versionAndId("v2.3.1/PID")).toEqual(["2.3.1", "PID"]);
    expect(versionAndId("vutg/v2-0001")).toEqual(["utg", "v2-0001"]);
  });
});
