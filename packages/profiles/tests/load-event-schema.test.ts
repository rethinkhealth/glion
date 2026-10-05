import { c, f, m, s } from "@glion/builder";

import { loadEventSchema } from "../src/load-event-schema";

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

describe(loadEventSchema, () => {
  it("loads the schema MSH-9.3 names", async () => {
    const schema = await loadEventSchema(
      message("2.5", f(c("ADT"), c("A01"), c("ADT_A01")))
    );

    expect(schema?.id).toBe("ADT_A01");
  });

  it("resolves the schema from MSH-9.1 and MSH-9.2 when MSH-9.3 is empty", async () => {
    const schema = await loadEventSchema(message("2.5", f(c("ADT"), c("A04"))));

    expect(schema?.id).toBe("ADT_A01");
  });

  it("loads the ACK schema for a general acknowledgment", async () => {
    const schema = await loadEventSchema(
      message("2.5", f(c("ACK"), c("A01"), c("ACK")))
    );

    expect(schema?.id).toBe("ACK");
  });

  it("returns nothing when the event maps to a schema the version does not define", async () => {
    expect(
      await loadEventSchema(message("2.4", f(c("QRY"), c("P04"))))
    ).toBeUndefined();
  });

  it("returns nothing when MSH-9 names no schema the version knows", async () => {
    expect(
      await loadEventSchema(message("2.5", f(c("ZZZ"), c("Z99"))))
    ).toBeUndefined();
  });

  it("returns nothing when MSH-12 is empty", async () => {
    expect(await loadEventSchema(message(""))).toBeUndefined();
  });

  it("resolves nothing, and does not reject, for MSH-9.3 naming an Object.prototype key", async () => {
    for (const key of [
      "constructor",
      "__proto__",
      "toString",
      "hasOwnProperty",
    ]) {
      const schema = await loadEventSchema(
        message("2.5", f(c("ADT"), c("A01"), c(key)))
      );

      expect(schema).toBeUndefined();
    }
  });

  it("resolves nothing for MSH-12 naming an Object.prototype key", async () => {
    for (const key of ["constructor", "__proto__", "toString"]) {
      const schema = await loadEventSchema(
        message(key, f(c("ADT"), c("A01"), c("ADT_A01")))
      );

      expect(schema).toBeUndefined();
    }
  });
});
