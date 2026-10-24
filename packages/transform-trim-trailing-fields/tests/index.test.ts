import type { Group } from "@glion/ast";
import { c, f, m, r, s } from "@glion/builder";
import { hl7v2Parser } from "@glion/parser";
import { hl7v2ToHl7v2 } from "@glion/to-hl7v2";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import { hl7v2TransformTrimTrailingFields } from "../src";

const processor = unified()
  .use(hl7v2Parser)
  .use(hl7v2TransformTrimTrailingFields)
  .use(hl7v2ToHl7v2);

const write = async (source: string): Promise<string> =>
  String(await processor.process(source));

describe("hl7v2TransformTrimTrailingFields", () => {
  it("removes the empty fields at the end of a segment", async () => {
    expect(await write("MSH|^~\\&|APP\rPID|1|DOE|||")).toBe(
      "MSH|^~\\&|APP\rPID|1|DOE"
    );
  });

  it("removes the empty fields at the end of every segment", async () => {
    expect(await write("MSH|^~\\&|APP||\rPID|1||\rPV1|I|")).toBe(
      "MSH|^~\\&|APP\rPID|1\rPV1|I"
    );
  });

  it("keeps the empty fields before the last field with a value", async () => {
    expect(await write("PID|||12345||DOE|")).toBe("PID|||12345||DOE");
  });

  it("writes a segment with only empty fields as its Segment ID", async () => {
    expect(await write("MSH|^~\\&|APP\rPID|||")).toBe("MSH|^~\\&|APP\rPID");
  });

  it("leaves a segment without trailing empty fields as it is", async () => {
    const source = "MSH|^~\\&|APP\rPID|1|DOE^JOHN";

    expect(await write(source)).toBe(source);
  });

  it("keeps a trailing field that holds the HL7v2 null value", async () => {
    expect(await write('PID|1|""|')).toBe('PID|1|""');
  });

  it("removes a trailing field whose components hold no value", async () => {
    expect(await write("PID|1|^^|")).toBe("PID|1");
  });

  it("removes a trailing field whose repetitions hold no value", async () => {
    expect(await write("PID|1|~|")).toBe("PID|1");
  });

  it("removes a trailing field whose subcomponents hold no value", async () => {
    expect(await write("PID|1|&|")).toBe("PID|1");
  });

  it("keeps a trailing field with a value in a later component", async () => {
    expect(await write("PID|1|^DEF|")).toBe("PID|1|^DEF");
  });

  it("keeps a trailing field with a value in a later repetition", async () => {
    expect(await write("PID|1|~DEF|")).toBe("PID|1|~DEF");
  });

  it("removes a trailing field whose one subcomponent is empty", async () => {
    const tree = m(s("PID", f("1"), f(r(c(""))), f("")));

    await unified().use(hl7v2TransformTrimTrailingFields).run(tree);

    expect(tree.children[0]).toMatchObject({ children: [f("1")] });
  });

  it("removes a trailing field that holds one repetition or component with no children", async () => {
    const tree = m(
      s(
        "PID",
        f("1"),
        {
          children: [{ children: [], type: "field-repetition" }],
          type: "field",
        },
        { children: [r({ children: [], type: "component" })], type: "field" }
      )
    );

    await unified().use(hl7v2TransformTrimTrailingFields).run(tree);

    expect(tree.children[0]).toMatchObject({ children: [f("1")] });
  });

  it("removes the empty fields at the end of a segment inside a group", async () => {
    const group: Group = {
      children: [s("PID", f("1"), f(), f())],
      id: "PATIENT",
      name: "Patient",
      type: "group",
    };
    const tree = m(group);

    await unified().use(hl7v2TransformTrimTrailingFields).run(tree);

    expect(group.children[0]).toMatchObject({ children: [f("1")] });
  });
});
