import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileDatatypes } from "@glion/annotate-profile-datatypes";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import type { Root } from "@glion/ast";
import { hl7v2Parser } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintTimestamps from "../src";

const processor = unified()
  .use(hl7v2Parser)
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2AnnotateProfileFields)
  .use(hl7v2AnnotateProfileDatatypes)
  .use(hl7v2LintTimestamps);

async function lint(...segments: string[]) {
  const file = new VFile(segments.map((segment) => `${segment}\r`).join(""));
  await processor.run(processor.parse(file), file);
  return file.messages.filter((message) => message.ruleId === "timestamps");
}

const msh = (version: string) =>
  `MSH|^~\\&|SENDER|FAC|RECV|RFAC|20260307143045||ADT^A01|MSG001|P|${version}`;

describe("hl7v2LintTimestamps", () => {
  it("reports nothing for valid dates and times", async () => {
    const messages = await lint(
      msh("2.5"),
      "EVN|A01|20260307143045.1234-0500",
      "PID|1||123||Doe^John||19800229",
      "IN1|1|PLAN|123|||||||||20260101|20261231"
    );
    expect(messages).toEqual([]);
  });

  it("reports February 29 of a year that is not a leap year in TS.1 of a v2.5 TS", async () => {
    const [message, ...rest] = await lint(
      msh("2.5"),
      "PID|1||123||Doe^John||20250229"
    );
    expect(rest).toEqual([]);
    expect(message?.reason).toBe(
      "The day is past the end of its month; a date must name a day its month has."
    );
    expect(message?.actual).toBe("20250229");
  });

  it("reports February 29 of a century year not divisible by 400 in a v2.6 DTM field", async () => {
    const [message] = await lint(msh("2.6"), "PID|1||123||Doe^John||19000229");
    expect(message?.reason).toBe(
      "The day is past the end of its month; a date must name a day its month has."
    );
  });

  it("reports TS.1 in v2.3, where the standard types it ST", async () => {
    const [message] = await lint(msh("2.3"), "PID|1||123||Doe^John||19801301");
    expect(message?.reason).toBe(
      "The month is out of range; a month is `01` to `12`."
    );
  });

  it("reports a primitive TS in v2.1 as a DTM", async () => {
    const [message] = await lint(msh("2.1"), "EVN|A01|2026-03-07");
    expect(message?.reason).toBe(
      "The value is not a date and time; a DTM value has the form `YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]`."
    );
  });

  it("reports a DT field in the DT format", async () => {
    const [message] = await lint(
      msh("2.5"),
      "IN1|1|PLAN|123|||||||||2026-01-01"
    );
    expect(message?.reason).toBe(
      "The value is not a date; a DT value has the form `YYYY[MM[DD]]`."
    );
  });

  it("reports a DT with a time, which DT does not allow", async () => {
    const [message] = await lint(
      msh("2.5"),
      "IN1|1|PLAN|123|||||||||202601011200"
    );
    expect(message?.reason).toBe(
      "The value is not a date; a DT value has the form `YYYY[MM[DD]]`."
    );
  });

  it("reports a TM field in the TM format", async () => {
    const [message] = await lint(msh("2.5"), "TQ1|1|||14:30");
    expect(message?.reason).toBe(
      "The value is not a time; a TM value has the form `HH[MM[SS[.S[S[S[S]]]]]][+/-ZZZZ]`."
    );
  });

  it("reports hour 24", async () => {
    const [message] = await lint(msh("2.5"), "TQ1|1|||2400");
    expect(message?.reason).toBe(
      "The hour is out of range; an hour is `00` to `23`."
    );
  });

  it("reports minute 60", async () => {
    const [message] = await lint(msh("2.5"), "TQ1|1|||1460");
    expect(message?.reason).toBe(
      "The minute is out of range; a minute is `00` to `59`."
    );
  });

  it("reports second 60", async () => {
    const [message] = await lint(msh("2.5"), "TQ1|1|||235960");
    expect(message?.reason).toBe(
      "The second is out of range; a second is `00` to `59`."
    );
  });

  it("reports an offset of more than 14 hours", async () => {
    const [message] = await lint(msh("2.5"), "EVN|A01|20260307+1500");
    expect(message?.reason).toBe(
      "The offset is out of range; an offset is at most 14 hours, with minutes `00` to `59`."
    );
  });

  it("reports a TS.1 inside a component, as a subcomponent", async () => {
    const [message] = await lint(
      msh("2.5"),
      "PV1|1|I|||||1234^Smith^John^^^^^^^^^^^^^^^^20251301"
    );
    expect(message?.reason).toBe(
      "The month is out of range; a month is `01` to `12`."
    );
  });

  it("reports each repetition on its own", async () => {
    const messages = await lint(msh("2.5"), "TQ1|1|||2400~1200~2500");
    expect(messages.map((message) => message.actual)).toEqual(["2400", "2500"]);
  });

  it("does not check the explicit null", async () => {
    expect(await lint(msh("2.6"), 'PID|1||123||Doe^John||""')).toEqual([]);
  });

  it("does not check empty values", async () => {
    expect(await lint(msh("2.6"), "PID|1||123||Doe^John||")).toEqual([]);
  });

  it("does not check fields of a segment the standard does not define", async () => {
    expect(await lint(msh("2.6"), "ZPI|1|2025-02-29")).toEqual([]);
  });

  it("points a finding on a primitive field at its repetition", async () => {
    const [message] = await lint(msh("2.6"), "PID|1||123||Doe^John||19000229");
    expect(message?.place).toStrictEqual({
      end: { column: 31, line: 2, offset: 97 },
      start: { column: 23, line: 2, offset: 89 },
    });
    expect(message?.ancestors?.map((node) => node.type)).toStrictEqual([
      "root",
      "segment",
      "field",
      "field-repetition",
    ]);
  });

  it("points a finding on TS.1 at its component", async () => {
    const [message] = await lint(msh("2.5"), "PID|1||123||Doe^John||20250229");
    expect(message?.place).toStrictEqual({
      end: { column: 31, line: 2, offset: 97 },
      start: { column: 23, line: 2, offset: 89 },
    });
    expect(message?.ancestors?.map((node) => node.type)).toStrictEqual([
      "root",
      "segment",
      "field",
      "field-repetition",
      "component",
    ]);
  });

  it("points a finding on a subcomponent at the subcomponent", async () => {
    const [message] = await lint(
      msh("2.5"),
      "PV1|1|I|||||1234^Smith^John^^^^^^^^^^^^^^^^20251301"
    );
    expect(message?.line).toBe(2);
    expect(message?.column).toBe(44);
    expect(message?.ancestors?.map((node) => node.type)).toStrictEqual([
      "root",
      "segment",
      "field",
      "field-repetition",
      "component",
      "subcomponent",
    ]);
  });
});

describe("hl7v2LintTimestamps on a tree built without the parser", () => {
  const run = async (tree: Root) => {
    const file = new VFile();
    await unified().use(hl7v2LintTimestamps).run(tree, file);
    return file.messages;
  };

  it("does not fail on a primitive repetition with no components", async () => {
    const tree: Root = {
      children: [
        {
          children: [
            {
              children: [
                {
                  children: [],
                  data: { datatypeId: "DTM", kind: "primitive" },
                  type: "field-repetition",
                },
              ],
              data: { id: "PID-7", name: "Date/Time of Birth" },
              type: "field",
            },
          ],
          name: "PID",
          type: "segment",
        },
      ],
      type: "root",
    };
    expect(await run(tree)).toStrictEqual([]);
  });

  it("does not fail on a primitive repetition whose component has no subcomponents", async () => {
    const tree: Root = {
      children: [
        {
          children: [
            {
              children: [
                {
                  children: [{ children: [], type: "component" }],
                  data: { datatypeId: "DTM", kind: "primitive" },
                  type: "field-repetition",
                },
              ],
              data: { id: "PID-7", name: "Date/Time of Birth" },
              type: "field",
            },
          ],
          name: "PID",
          type: "segment",
        },
      ],
      type: "root",
    };
    expect(await run(tree)).toStrictEqual([]);
  });
});
