import { importFromIndex } from "../../src/stores/import-from-index";

const indexes = {
  "./v2.5/tables/index.ts": () =>
    Promise.resolve({ "./0001.json": () => Promise.resolve({ id: "0001" }) }),
};

describe("importFromIndex", () => {
  it("imports the profile through the directory's index", async () => {
    expect(await importFromIndex(indexes, "./v2.5/tables", "0001")).toEqual({
      id: "0001",
    });
  });

  it("resolves undefined for a directory with no index", async () => {
    expect(
      await importFromIndex(indexes, "./v9.9/tables", "0001")
    ).toBeUndefined();
  });

  it("resolves undefined for a profile the index does not list", async () => {
    expect(
      await importFromIndex(indexes, "./v2.5/tables", "9999")
    ).toBeUndefined();
  });
});
