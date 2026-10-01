import { loadCodeSystems } from "../../src/loaders/code-systems";
import { loadTables } from "../../src/loaders/tables";

describe("loadCodeSystems", () => {
  it("loads UTG code system v2-0001", async () => {
    const codeSystems = await loadCodeSystems();
    const codeSystem = codeSystems.get("v2-0001");

    expect(codeSystem?.id).toBe("v2-0001");
    expect(codeSystem?.url).toBe(
      "http://terminology.hl7.org/CodeSystem/v2-0001"
    );
    expect(codeSystem?.codes.has("F")).toBe(true);
  });

  it("holds at least the codes of the latest version's table", async () => {
    const codeSystems = await loadCodeSystems();
    const tables = await loadTables("2.8.2");

    expect(codeSystems.get("v2-0001")?.codes.size).toBeGreaterThanOrEqual(
      tables?.get("0001")?.codes.size ?? Number.POSITIVE_INFINITY
    );
  });

  it("has no entry for an unknown code system", async () => {
    const codeSystems = await loadCodeSystems();

    expect(codeSystems.get("v2-ZZZZ")).toBeUndefined();
  });

  it("returns the same map on every call", async () => {
    const first = await loadCodeSystems();
    const second = await loadCodeSystems();

    expect(first).toBe(second);
  });
});
