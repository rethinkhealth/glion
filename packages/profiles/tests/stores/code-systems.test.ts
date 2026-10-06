import { codeSystems } from "../../src/stores/code-systems";

describe("codeSystems", () => {
  it("loads a code system, its codes keyed by code", async () => {
    const sex = await codeSystems.load("v2-0001");

    expect(sex).toMatchObject({
      id: "v2-0001",
      name: "AdministrativeSex",
      oid: "2.16.840.1.113883.18.2",
      title: "administrativeSex",
      url: "http://terminology.hl7.org/CodeSystem/v2-0001",
    });
    expect(sex?.codes.get("F")).toEqual({
      code: "F",
      display: "Female",
      status: "active",
    });
  });

  it("keeps codes that are not active", async () => {
    const sex = await codeSystems.load("v2-0001");

    expect(sex?.codes.get("X")?.status).toBe("N");
  });

  it("resolves the same value for repeated loads", async () => {
    const first = await codeSystems.load("v2-0001");
    const second = await codeSystems.load("v2-0001");

    expect(first).toBe(second);
  });

  it("resolves undefined for a code system that is not bundled", async () => {
    await expect(codeSystems.load("v2-ZZZZ")).resolves.toBeUndefined();
  });
});
