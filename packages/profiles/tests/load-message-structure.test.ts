import { c, f, m, s } from "@glion/builder";

import { loadMessageStructure } from "../src/load-message-structure";

/** An MSH naming `messageType` in MSH-9 and `version` in MSH-12. */
const message = (version: string, messageType = f(c("ADT"), c("A01"))) =>
  m(
    s(
      "MSH",
      f("|"),
      f("^~\\&"),
      f("SENDER"),
      f("FAC"),
      f("RECV"),
      f("RFAC"),
      f("20241201"),
      f(""),
      messageType,
      f("MSG001"),
      f("P"),
      f(version)
    )
  );

describe(loadMessageStructure, () => {
  it("loads the structure MSH-9.3 names", async () => {
    const definition = await loadMessageStructure(
      message("2.5", f(c("ADT"), c("A01"), c("ADT_A01")))
    );

    expect(definition?.structure.id).toBe("ADT_A01");
    expect(definition?.program.groups).toContain("PROCEDURE");
  });

  it("resolves the structure from MSH-9.1 and MSH-9.2 when MSH-9.3 is empty", async () => {
    const definition = await loadMessageStructure(
      message("2.5", f(c("ADT"), c("A04")))
    );

    expect(definition?.structure.id).toBe("ADT_A01");
  });

  it("loads the ACK structure for a general acknowledgment", async () => {
    const definition = await loadMessageStructure(
      message("2.5", f(c("ACK"), c("A01"), c("ACK")))
    );

    expect(definition?.structure.id).toBe("ACK");
  });

  it("returns nothing when the event maps to a structure the version does not define", async () => {
    expect(
      await loadMessageStructure(message("2.4", f(c("QRY"), c("P04"))))
    ).toBeUndefined();
  });

  it("returns nothing when MSH-9 names no structure the version knows", async () => {
    expect(
      await loadMessageStructure(message("2.5", f(c("ZZZ"), c("Z99"))))
    ).toBeUndefined();
  });

  it("returns nothing when MSH-12 is empty", async () => {
    expect(await loadMessageStructure(message(""))).toBeUndefined();
  });
});
