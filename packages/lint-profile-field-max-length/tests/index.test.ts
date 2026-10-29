import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import type { Segment } from "@glion/ast";
import { f, m, r, s } from "@glion/builder";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintFieldMaxLength from "../src";

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
 * and parsed, after the annotators it needs have put each field's maximum
 * length (LEN) on the tree.
 */
const lint = async (...segments: Segment[]) => {
  const file = new VFile();
  await unified()
    .use(hl7v2AnnotateProfileContext)
    .use(hl7v2AnnotateProfileFields)
    .use(hl7v2LintFieldMaxLength)
    .run(parseHL7v2(toHl7v2(m(...segments))), file);
  return file.messages;
};

// LEN, the maximum length, is per field and version. Most tests use v2.5
// PID-1 (Set ID - PID), which allows 4 characters, and PID-2 (Patient ID), 20.
describe("hl7v2LintFieldMaxLength", () => {
  // The boundary of LEN: under it, exactly at it, and one past it.
  it("accepts a value shorter than the maximum length", async () => {
    expect(
      await lint(
        msh("2.5"),
        // PID|123
        s("PID", f("123"))
      )
    ).toEqual([]);
  });

  it("accepts a value exactly as long as the maximum length", async () => {
    expect(
      await lint(
        msh("2.5"),
        // PID|1234
        s("PID", f("1234"))
      )
    ).toEqual([]);
  });

  // The full finding: its text, the length found (`actual`), which rule made
  // it, and where it points: `12345`, columns 5 to 10 of line 2.
  it("reports a value one character longer than the maximum length", async () => {
    const [message, ...rest] = await lint(
      msh("2.5"),
      // PID|12345
      s("PID", f("12345"))
    );

    expect(rest).toEqual([]);
    expect(message?.message).toBe(
      "The value is 5 characters long; the field allows at most 4 characters."
    );
    expect(message?.actual).toBe("5");
    expect(message?.ruleId).toBe("field-max-length");
    expect(message?.source).toBe("hl7v2-lint");
    expect(message?.place).toEqual({
      end: { column: 10, line: 2, offset: 78 },
      start: { column: 5, line: 2, offset: 73 },
    });
    expect(message?.ancestors?.map((node) => node.type)).toEqual([
      "root",
      "segment",
      "field",
      "field-repetition",
    ]);
  });

  it("accepts an empty field", async () => {
    expect(
      await lint(
        msh("2.5"),
        // PID|
        s("PID", f())
      )
    ).toEqual([]);
  });

  // A composite's length is the sum of its values; the `^` and `&` between them do not count.
  describe("a composite value", () => {
    it("counts the characters of its components, not the delimiters", async () => {
      // 12 + 8 + 2 = 22 characters, 25 with the delimiters
      const messages = await lint(
        msh("2.5"),
        // PID|1|ID1234567890^^^HOSPITAL^MR
        s("PID", f("1"), f("ID1234567890", "", "", "HOSPITAL", "MR"))
      );

      expect(messages.map((message) => message.message)).toEqual([
        "The value is 22 characters long; the field allows at most 20 characters.",
      ]);
    });

    it("accepts a value within the limit once its delimiters are left out", async () => {
      // 10 + 8 + 2 = 20 characters, 23 with the delimiters
      expect(
        await lint(
          msh("2.5"),
          // PID|1|ID12345678^^^HOSPITAL^MR
          s("PID", f("1"), f("ID12345678", "", "", "HOSPITAL", "MR"))
        )
      ).toEqual([]);
    });
  });

  // HL7v2 applies LEN to each repetition, not to the whole field.
  describe("a repeating field", () => {
    // Two repetitions of 200 characters: 400 in total, but each is within 250.
    it("measures each repetition on its own", async () => {
      // v2.5 PID-3 (Patient Identifier List) allows 250 characters per repetition
      const repetition = "A".repeat(200);

      expect(
        await lint(
          msh("2.5"),
          // PID|1||<repetition>~<repetition>
          s("PID", f("1"), f(), f(r(repetition), r(repetition)))
        )
      ).toEqual([]);
    });

    // `123` fits, `12345` does not. The report points at `12345` (columns 9 to
    // 14 of line 2) and its ancestors end at that repetition.
    it("reports only the repetition over the limit, and places the report on it", async () => {
      const [message, ...rest] = await lint(
        msh("2.5"),
        // PID|123~12345
        s("PID", f(r("123"), r("12345")))
      );

      expect(rest).toEqual([]);
      expect(message?.message).toBe(
        "The value is 5 characters long; the field allows at most 4 characters."
      );
      expect(message?.place).toEqual({
        end: { column: 14, line: 2, offset: 82 },
        start: { column: 9, line: 2, offset: 77 },
      });
      expect(message?.ancestors?.map((node) => node.type)).toEqual([
        "root",
        "segment",
        "field",
        "field-repetition",
      ]);
    });
  });

  // The standard does not define Z-segments, so their fields have no LEN.
  it("skips a segment without a profile", async () => {
    expect(
      await lint(
        msh("2.5"),
        // ZPD|<"X".repeat(500)>
        s("ZPD", f("X".repeat(500)))
      )
    ).toEqual([]);
  });

  it("accepts a value of any length in a field that has no LEN", async () => {
    const field = f("A".repeat(100_000));
    field.data = { id: "ZPD-1", name: "Site Code" };
    const file = new VFile();

    await unified()
      .use(hl7v2LintFieldMaxLength)
      .run(m(s("ZPD", field)), file);

    expect(file.messages).toEqual([]);
  });

  // MSH-12 is empty, so no profile is loaded and nothing can be checked.
  it("reports nothing when the message has no version", async () => {
    expect(
      await lint(
        msh(""),
        // PID|12345
        s("PID", f("12345"))
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
      // PID|12345
      s("PID", f("12345"))
    );

    expect(messages.map((message) => message.message)).toEqual([
      "The value is 5 characters long; the field allows at most 4 characters.",
    ]);
  });
});
