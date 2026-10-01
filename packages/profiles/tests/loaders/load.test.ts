import { loaderByVersion, versionOf } from "../../src/loaders/load";

// A module is evaluated once, so every import of a file resolves the same data.
const v25 = ["foo"];
const v251 = ["foo 2.5.1"];
const files = {
  "../profiles/v2.5.1/fields.json": () => Promise.resolve(v251),
  "../profiles/v2.5/fields.json": () => Promise.resolve(v25),
};

describe("loaderByVersion", () => {
  it("compiles the file of the version", async () => {
    const load = loaderByVersion(files, (raw: readonly string[]) =>
      raw.map((value) => value.toUpperCase())
    );

    await expect(load("2.5")).resolves.toEqual(["FOO"]);
    await expect(load("2.5.1")).resolves.toEqual(["FOO 2.5.1"]);
  });

  it("resolves undefined for a version no file is bundled for", async () => {
    const load = loaderByVersion(files, (raw: readonly string[]) => raw);

    await expect(load("2.7")).resolves.toBeUndefined();
    await expect(load("__proto__")).resolves.toBeUndefined();
  });

  it("does not keep a failed import", async () => {
    let attempts = 0;
    const load = loaderByVersion(
      {
        "../profiles/v2.5/fields.json": () => {
          attempts += 1;
          return attempts === 1
            ? Promise.reject(new Error("chunk failed to load"))
            : Promise.resolve(v25);
        },
      },
      (raw: readonly string[]) => raw
    );

    await expect(load("2.5")).rejects.toThrow("chunk failed to load");
    await expect(load("2.5")).resolves.toBe(v25);
  });

  it("compiles each file once, even for concurrent loads", async () => {
    const compile = vi.fn((raw: readonly string[]) => [...raw]);
    const load = loaderByVersion(files, compile);

    const [first, second] = await Promise.all([load("2.5"), load("2.5")]);
    const third = await load("2.5");

    expect(first).toBe(second);
    expect(third).toBe(first);
    expect(compile).toHaveBeenCalledTimes(1);
  });
});

describe("versionOf", () => {
  it("reads the version of a bundled profile path", () => {
    expect(versionOf("../profiles/v2.3.1/tables.json")).toBe("2.3.1");
    expect(versionOf("./profiles/v2.8.2/event-map.json")).toBe("2.8.2");
  });

  it("throws for a path that names no version", () => {
    expect(() => versionOf("../profiles/utg/code-systems.json")).toThrow(
      "This is a bug."
    );
  });
});
