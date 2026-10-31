/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1137.
 *
 * Date: 2026-10-28
 * Symptom: every message was written without a segment terminator after its
 * last segment: `MSH|^~\&\rPID|1` instead of `MSH|^~\&\rPID|1\r`, so every
 * message sent over MLLP left it out.
 * Cause: the serializer joined the segments with the segment terminator,
 * which writes it between segments and never after the last one. HL7v2
 * Chapter 2, v2.3 to v2.9, ends every segment with a carriage return.
 * Resolution: the serializer writes the segment terminator after every
 * segment of a message or group, the last one included.
 */

import { f, m, s } from "@glion/builder";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import { hl7v2ToHl7v2, toHl7v2 } from "../../src";

describe("the last segment of a message", () => {
  const tree = () => m(s("MSH", f("|"), f("^~\\&")), s("PID", f("1")));

  it("ends with the segment terminator", () => {
    expect(toHl7v2(tree())).toBe("MSH|^~\\&\rPID|1\r");
  });

  it("ends with the segment terminator when the compiler plugin writes it", () => {
    expect(unified().use(hl7v2ToHl7v2).stringify(tree())).toBe(
      "MSH|^~\\&\rPID|1\r"
    );
  });
});
