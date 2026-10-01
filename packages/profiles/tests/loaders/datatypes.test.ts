import { loadDatatypes } from "../../src/loaders/datatypes";

describe("loadDatatypes", () => {
  it("loads a composite datatype with its components and title", async () => {
    const datatypes = await loadDatatypes("2.5");
    const cwe = datatypes?.get("CWE");

    expect(cwe?.id).toBe("CWE");
    expect(cwe?.version).toBe("2.5");
    expect(cwe?.kind).toBe("composite");
    expect(cwe?.title).toBe("Coded with Exceptions");
    expect(cwe?.componentsBySequence.get(1)?.datatypeId).toBe("ST");
  });

  it("loads a primitive datatype with no components", async () => {
    const datatypes = await loadDatatypes("2.5");
    const st = datatypes?.get("ST");

    expect(st?.kind).toBe("primitive");
    expect(st?.componentsBySequence.size).toBe(0);
  });

  it("keys each version by its own datatypes", async () => {
    const v21 = await loadDatatypes("2.1");
    const v25 = await loadDatatypes("2.5");

    expect(v21?.get("CE")?.version).toBe("2.1");
    expect(v25?.get("CE")?.version).toBe("2.5");
  });

  it("has no entry for an unknown datatype", async () => {
    const datatypes = await loadDatatypes("2.5");

    expect(datatypes?.get("ZZZZZ")).toBeUndefined();
  });

  it("resolves undefined for a version not bundled", async () => {
    await expect(loadDatatypes("99.99")).resolves.toBeUndefined();
  });

  it("returns the same map on every call", async () => {
    const first = await loadDatatypes("2.5");
    const second = await loadDatatypes("2.5");

    expect(first).toBe(second);
  });
});
