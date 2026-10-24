/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1088.
 *
 * Date: 2026-10-24
 * Symptom: a segment that is only the field separator, `|`, was written back
 * as an empty line, and the next parse dropped it.
 * Cause: the parser read the text before the `|` as an empty first field and
 * dropped the empty field after it, which left a segment with an empty Segment
 * ID and no fields; `@glion/to-hl7v2` wrote that as an empty line.
 * Resolution: a line that starts with `|` has an empty Segment ID, the parser
 * keeps the empty field after the `|`, and the serializer writes the
 * separator after an empty Segment ID like any other.
 */

import { hl7v2AnnotateDelimiters } from "@glion/annotate-delimiters";
import { hl7v2Parser } from "@glion/parser";
import { hl7v2ToHl7v2 } from "@glion/to-hl7v2";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

const processor = unified()
  .use(hl7v2Parser)
  .use(hl7v2AnnotateDelimiters)
  .use(hl7v2ToHl7v2)
  .freeze();

describe("a segment that is only the field separator", () => {
  it("is written back as it was read, on every round trip", async () => {
    const text = "|\rPID|1";
    const first = String(await processor.process(text));
    const second = String(await processor.process(first));

    expect(first).toBe(text);
    expect(second).toBe(text);
  });
});
