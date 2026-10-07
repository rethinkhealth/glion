/**
 * Regression for https://github.com/rethinkhealth/glion/issues/898.
 *
 * Date: 2026-10-07
 * Symptom: an empty message got no report from the rule; the parser turns
 * `""` into a `root` with no children.
 * Cause: the rule reported only when it visited a first segment that is not
 * `MSH`, and a message with no segments has none to visit.
 * Resolution: the rule reports a message with no segments as missing its
 * header.
 */

import { m } from "@glion/builder";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintRequiredMessageHeader from "../../src";

describe("a message with no segments", () => {
  it("reports the missing message header", async () => {
    const file = new VFile();

    await unified().use([hl7v2LintRequiredMessageHeader]).run(m(), file);

    expect(file.messages).toHaveLength(1);
    expect(file.messages[0]).toMatchObject({
      message:
        "Message header (MSH) segment is required as the first segment — received an empty message instead",
      ruleId: "segment-required-message-header",
    });
  });
});
