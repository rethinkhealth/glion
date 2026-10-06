import { lazyImport } from "../../src/stores/utils";

describe("lazyImport", () => {
  it("imports the profile at a path in a versioned directory", async () => {
    expect(
      await lazyImport<{ id: string }>("../profiles/v2.5/tables/0001.json")
    ).toMatchObject({ id: "0001" });
  });

  it("imports the profile at a path in the UTG directory", async () => {
    expect(
      await lazyImport<{ id: string }>("../profiles/utg/v2-0001.json")
    ).toMatchObject({ id: "v2-0001" });
  });

  it("imports a file of a version itself", async () => {
    const segments = await lazyImport<{ segments: { id: string }[] }>(
      "../profiles/v2.5/segments.json"
    );

    expect(segments?.segments.some(({ id }) => id === "PID")).toBe(true);
  });

  it("resolves undefined for a file a version does not bundle", async () => {
    expect(await lazyImport("../profiles/v9.9/segments.json")).toBeUndefined();
  });

  it("resolves the same value for repeated imports", async () => {
    const first = await lazyImport("../profiles/v2.5/tables/0001.json");
    const second = await lazyImport("../profiles/v2.5/tables/0001.json");

    expect(first).toBe(second);
  });

  it("resolves undefined for a directory that is not bundled", async () => {
    expect(
      await lazyImport("../profiles/v9.9/tables/0001.json")
    ).toBeUndefined();
  });

  it("resolves undefined for a profile the directory does not bundle", async () => {
    expect(
      await lazyImport("../profiles/v2.5/tables/ZZZZ.json")
    ).toBeUndefined();
  });

  it("resolves undefined for a path that leaves its directory", async () => {
    expect(
      await lazyImport("../profiles/v2.5/fields/../tables/0001.json")
    ).toBeUndefined();
  });
});
