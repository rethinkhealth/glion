import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import type { Segment } from "@glion/ast";
import { f, m, r, s } from "@glion/builder";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintFieldRepetition from "../src";

/**
 * An MSH segment declaring `version` in MSH-12; the rule checks the message
 * against that version.
 */
const msh = (version: string) =>
  // MSH|^~\&|SENDER|FAC|RECV|RFAC|20241201||ADT^A01^ADT_A01|MSG001|P|<version>
  s(
    "MSH",
    f("|"),
    f("^~\\&"),
    f("SENDER"),
    f("FAC"),
    f("RECV"),
    f("RFAC"),
    f("20241201"),
    f(),
    f("ADT", "A01", "ADT_A01"),
    f("MSG001"),
    f("P"),
    f(version)
  );

/**
 * The findings of the rule on a message of `segments`, written as HL7v2 text
 * and parsed, after the annotators it needs have put each field's repetition
 * limit (RP/#) on the tree.
 */
const lint = async (...segments: Segment[]) => {
  const file = new VFile();
  await unified()
    .use(hl7v2AnnotateProfileContext)
    .use(hl7v2AnnotateProfileFields)
    .use(hl7v2LintFieldRepetition)
    .run(parseHL7v2(toHl7v2(m(...segments))), file);
  return file.messages;
};

/**
 * A v2.6 OBR segment whose OBR-17 (Order Callback Phone Number, at most 2
 * repetitions) holds `repetitions`.
 */
// OBR|||||||||||||||||<repetitions, separated by ~>
const obr17 = (...repetitions: string[]) =>
  s(
    "OBR",
    ...Array.from({ length: 16 }, () => f()),
    f(...repetitions.map((repetition) => r(repetition)))
  );

// Each field has a repetition limit (RP/#): 1 when it does not repeat, a
// number such as 2, or no limit. Repetitions are separated by `~`.
describe("hl7v2LintFieldRepetition", () => {
  describe("a field that does not repeat", () => {
    it("accepts one value", async () => {
      // v2.5 PID-7 (Date/Time of Birth) does not repeat
      expect(
        await lint(
          msh("2.5"),
          // PID|1||12345||DOE^JOHN||19800101
          s(
            "PID",
            f("1"),
            f(),
            f("12345"),
            f(),
            f("DOE", "JOHN"),
            f(),
            f("19800101")
          )
        )
      ).toEqual([]);
    });

    // The full finding: its text, the number of repetitions found (`actual`),
    // and which rule made it.
    it("reports two repetitions", async () => {
      const [message, ...rest] = await lint(
        msh("2.5"),
        // PID|1||12345||DOE^JOHN||19800101~19800102
        s(
          "PID",
          f("1"),
          f(),
          f("12345"),
          f(),
          f("DOE", "JOHN"),
          f(),
          f(r("19800101"), r("19800102"))
        )
      );

      expect(rest).toEqual([]);
      expect(message?.message).toBe(
        "The field has 2 repetitions; it allows at most 1 repetition."
      );
      expect(message?.actual).toBe("2");
      expect(message?.ruleId).toBe("field-repetition");
      expect(message?.source).toBe("hl7v2-lint");
    });

    // An empty field has one (empty) repetition, within any limit.
    it("accepts an empty field", async () => {
      expect(
        await lint(
          msh("2.5"),
          // PID|1||12345||DOE^JOHN||
          s("PID", f("1"), f(), f("12345"), f(), f("DOE", "JOHN"), f(), f())
        )
      ).toEqual([]);
    });
  });

  // The boundary of a numeric limit: exactly at it, and one past it.
  describe("a field with a repetition limit", () => {
    it("accepts as many repetitions as the limit", async () => {
      expect(await lint(msh("2.6"), obr17("555-0001", "555-0002"))).toEqual([]);
    });

    it("reports one repetition more than the limit", async () => {
      const messages = await lint(
        msh("2.6"),
        obr17("555-0001", "555-0002", "555-0003")
      );

      expect(messages.map((message) => message.message)).toEqual([
        "The field has 3 repetitions; it allows at most 2 repetitions.",
      ]);
    });
  });

  // Five identifiers in a field whose limit is "unbounded".
  it("accepts any number of repetitions in a field without a limit", async () => {
    // v2.5 PID-3 (Patient Identifier List) repeats without a limit
    expect(
      await lint(
        msh("2.5"),
        // PID|1||A1~A2~A3~A4~A5||DOE^JOHN
        s(
          "PID",
          f("1"),
          f(),
          f(r("A1"), r("A2"), r("A3"), r("A4"), r("A5")),
          f(),
          f("DOE", "JOHN")
        )
      )
    ).toEqual([]);
  });

  // Two fields of PID and one of OBX break their limit: one report each, in
  // message order.
  it("reports each field with too many repetitions, in every segment", async () => {
    const messages = await lint(
      msh("2.5"),
      // PID|1~2||12345||DOE^JOHN||19800101~19800102
      s(
        "PID",
        f(r("1"), r("2")),
        f(),
        f("12345"),
        f(),
        f("DOE", "JOHN"),
        f(),
        f(r("19800101"), r("19800102"))
      ),
      // OBX|1~2
      s("OBX", f(r("1"), r("2")))
    );

    expect(messages.map((message) => message.message)).toEqual([
      "The field has 2 repetitions; it allows at most 1 repetition.",
      "The field has 2 repetitions; it allows at most 1 repetition.",
      "The field has 2 repetitions; it allows at most 1 repetition.",
    ]);
  });

  // The report points at `1~2` on line 2 (columns 5 to 8), and its ancestors
  // end at the field.
  it("places the report on the field", async () => {
    const [message] = await lint(
      msh("2.5"),
      // PID|1~2
      s("PID", f(r("1"), r("2")))
    );

    expect(message?.place).toEqual({
      end: { column: 8, line: 2, offset: 76 },
      start: { column: 5, line: 2, offset: 73 },
    });
    expect(message?.ancestors?.map((node) => node.type)).toEqual([
      "root",
      "segment",
      "field",
    ]);
  });

  it("skips a segment without a profile", async () => {
    expect(
      await lint(
        msh("2.5"),
        // ZPD|a~b
        s("ZPD", f(r("a"), r("b")))
      )
    ).toEqual([]);
  });

  // MSH-12 is empty, so no profile is loaded and nothing can be checked.
  it("reports nothing when the message has no version", async () => {
    expect(
      await lint(
        msh(""),
        // PID|1~2
        s("PID", f(r("1"), r("2")))
      )
    ).toEqual([]);
  });

  // https://github.com/rethinkhealth/hl7v2/issues/489
  // MSH-12 is a VID, whose first component is the version: `2.5^USA^ISO`.
  it("reads the version from a composite MSH-12", async () => {
    const messages = await lint(
      // MSH|^~\&|SENDER|FAC|RECV|RFAC|20241201||ADT^A01^ADT_A01|MSG001|P|2.5^USA^ISO
      s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f("SENDER"),
        f("FAC"),
        f("RECV"),
        f("RFAC"),
        f("20241201"),
        f(),
        f("ADT", "A01", "ADT_A01"),
        f("MSG001"),
        f("P"),
        f("2.5", "USA", "ISO")
      ),
      // PID|1~2
      s("PID", f(r("1"), r("2")))
    );

    expect(messages.map((message) => message.message)).toEqual([
      "The field has 2 repetitions; it allows at most 1 repetition.",
    ]);
  });
});
