import type { Segment } from "@glion/ast";
import { f, m, s } from "@glion/builder";
import { parseHL7v2 } from "@glion/parser";
import type { EventSchema } from "@glion/profiles";
import { toHl7v2 } from "@glion/to-hl7v2";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it, vi } from "vitest";

import hl7v2LintSegmentOrder from "../src";

// repair() finds edits for every message runner() rejects; these tests break
// that contract on purpose, with a repair() that finds none.
vi.mock("@glion/profiles", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  repair: () => [],
}));

/** MSH, then PID, both required. */
const MSH_PID: EventSchema = {
  elements: [
    { name: "MSH", optional: false, repeating: false, type: "segment" },
    { name: "PID", optional: false, repeating: false, type: "segment" },
  ],
  id: "TEST",
};

/** The findings for the message whose segments are `segments`. */
const lintAgainst = async (...segments: Segment[]) => {
  const file = new VFile();
  await unified()
    .use(hl7v2LintSegmentOrder, { definition: MSH_PID })
    .run(parseHL7v2(toHl7v2(m(...segments))), file);
  return file.messages;
};

// When the rule cannot list a rejected message's edits, it still reports the
// message, as the first segment that does not fit, and says why in `note`.
describe("a message the rule cannot list the edits of", () => {
  // XXX stands where PID belongs.
  it("reports the first segment that does not fit", async () => {
    const [message, ...rest] = await lintAgainst(
      // MSH|^~\&
      s("MSH", f("|"), f("^~\\&")),
      // XXX|1
      s("XXX", f("1"))
    );

    expect(rest).toEqual([]);
    expect(message?.reason).toBe(
      "The segment is out of place; the event schema does not allow it at this point."
    );
    expect(message?.actual).toBe("XXX");
    expect(message?.expected).toEqual(["PID"]);
    expect(message?.note).toBe(
      "The rule could not list every missing or out-of-place segment in this message, so it reports only the first segment that does not fit. This is a bug; please report it."
    );
  });

  // The message ends after MSH, before the PID the schema requires.
  it("reports where a message that ends early ends", async () => {
    const [message, ...rest] = await lintAgainst(
      // MSH|^~\&
      s("MSH", f("|"), f("^~\\&"))
    );

    expect(rest).toEqual([]);
    expect(message?.reason).toBe(
      "The message ends before its event schema is complete; the event schema requires `PID` next."
    );
    expect(message?.expected).toEqual(["PID"]);
    expect(message?.note).toBe(
      "The rule could not list every missing or out-of-place segment in this message, so it reports only where the message ends. This is a bug; please report it."
    );
  });

  // `|1` has no characters before its first field separator, and stands where
  // PID belongs.
  it("reports a segment with an empty Segment ID that does not fit", async () => {
    const [message, ...rest] = await lintAgainst(
      // MSH|^~\&
      s("MSH", f("|"), f("^~\\&")),
      // |1
      s("", f("1"))
    );

    expect(rest).toEqual([]);
    expect(message?.reason).toBe(
      "The segment is out of place; the event schema does not allow it at this point."
    );
    expect(message?.actual).toBe("");
  });

  // The message ends after MSH, where the schema requires a slot any segment
  // fills. `Hxx` is not a Segment ID, so the report describes it in words and
  // sets no `expected`.
  it("describes a slot any segment fills in words where a message ends early", async () => {
    const file = new VFile();
    await unified()
      .use(hl7v2LintSegmentOrder, {
        definition: {
          elements: [
            { name: "MSH", optional: false, repeating: false, type: "segment" },
            { name: "Hxx", optional: false, repeating: false, type: "segment" },
          ],
          id: "TEST",
        },
      })
      .run(
        parseHL7v2(
          toHl7v2(
            m(
              // MSH|^~\&
              s("MSH", f("|"), f("^~\\&"))
            )
          )
        ),
        file
      );

    expect(file.messages.map((message) => message.reason)).toEqual([
      "The message ends before its event schema is complete; the event schema requires any segment next.",
    ]);
    expect(file.messages[0]?.expected).toBeUndefined();
  });

  // The same, for a slot any Z-segment fills.
  it("describes a slot any Z-segment fills in words where a message ends early", async () => {
    const file = new VFile();
    await unified()
      .use(hl7v2LintSegmentOrder, {
        definition: {
          elements: [
            { name: "MSH", optional: false, repeating: false, type: "segment" },
            {
              name: "anyZSegment",
              optional: false,
              repeating: false,
              type: "segment",
            },
          ],
          id: "TEST",
        },
      })
      .run(
        parseHL7v2(
          toHl7v2(
            m(
              // MSH|^~\&
              s("MSH", f("|"), f("^~\\&"))
            )
          )
        ),
        file
      );

    expect(file.messages.map((message) => message.reason)).toEqual([
      "The message ends before its event schema is complete; the event schema requires any Z-segment next.",
    ]);
    expect(file.messages[0]?.expected).toBeUndefined();
  });

  // PID stands where only a Z-segment fits. No Segment ID is valid there, so
  // the report sets no `expected`.
  it("sets no expected segment IDs on a segment that does not fit where only a Z-segment does", async () => {
    const file = new VFile();
    await unified()
      .use(hl7v2LintSegmentOrder, {
        definition: {
          elements: [
            { name: "MSH", optional: false, repeating: false, type: "segment" },
            {
              name: "anyZSegment",
              optional: false,
              repeating: false,
              type: "segment",
            },
          ],
          id: "TEST",
        },
      })
      .run(
        parseHL7v2(
          toHl7v2(
            m(
              // MSH|^~\&
              s("MSH", f("|"), f("^~\\&")),
              // PID|1
              s("PID", f("1"))
            )
          )
        ),
        file
      );

    expect(file.messages.map((message) => message.reason)).toEqual([
      "The segment is out of place; the event schema does not allow it at this point.",
    ]);
    expect(file.messages[0]?.expected).toBeUndefined();
  });

  // A tree built without positions has no end to point at.
  it("reports where a message that ends early ends without a place when the message has no position", async () => {
    const file = new VFile();
    await unified()
      .use(hl7v2LintSegmentOrder, { definition: MSH_PID })
      .run(m(s("MSH")), file);

    expect(file.messages.map((message) => message.reason)).toEqual([
      "The message ends before its event schema is complete; the event schema requires `PID` next.",
    ]);
    expect(file.messages[0]?.place).toBeUndefined();
  });
});
