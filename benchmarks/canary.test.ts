/**
 * Canary tests — prove each suite's processor/fixture pairing does real work.
 *
 * The failure mode these pin down: a profile-aware plugin silently bailing
 * (e.g. missing hl7v2AnnotateProfileContext leaves `file.data.profile`
 * unset), which turns a benchmark into a plausible-looking measurement of
 * an early return. A bench suite must fail loudly here, not measure nothing.
 */
import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import { m } from "@glion/builder";
import { MllpClient } from "@glion/mllp-client";
import { frame, unframe } from "@glion/mllp-codec";
import { parseHL7v2 } from "@glion/parser";
import hl7v2PresetLintProfileRecommended from "@glion/preset-lint-profile-recommended";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import { connectInMemory } from "./fixtures/memory-wire";
import {
  ADT_A01_SMALL,
  evnInvalid,
  MLLP_SMALL_MESSAGE,
  msh,
  obxCoded,
  pid,
  pidInvalid,
} from "./fixtures/messages";
import { source } from "./fixtures/streams";

describe("canary — suites measure real work", () => {
  it("parser: ADT_A01_SMALL parses to 3 segments", () => {
    const tree = parseHL7v2(ADT_A01_SMALL);
    expect(tree.children).toHaveLength(3);
  });

  it("lint-profile: the violations fixture yields messages", async () => {
    const processor = unified().use(hl7v2PresetLintProfileRecommended);
    const file = new VFile();
    await processor.run(m(msh(), evnInvalid(), pidInvalid()), file);
    expect(file.messages.length).toBeGreaterThan(0);
  });

  it("annotate-profile: fields get profile metadata", async () => {
    const processor = unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2AnnotateProfileFields);
    const tree = m(msh(), pid(), obxCoded(1));
    await processor.run(tree, new VFile());
    const annotated = tree.children.some(
      (segment) =>
        segment.type === "segment" &&
        segment.children.some(
          (field) => field.type === "field" && field.data?.name !== undefined
        )
    );
    expect(annotated).toBe(true);
  });

  it("mllp-codec: frame → unframe round-trips the payload", async () => {
    const payload = new TextEncoder().encode(MLLP_SMALL_MESSAGE);
    const reader = source([frame(payload)])
      .pipeThrough(unframe())
      .getReader();
    const payloads: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      payloads.push(value);
    }
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toEqual(payload);
  });

  it("mllp-client: the in-memory wire returns an AA response", async () => {
    const client = new MllpClient({
      connect: connectInMemory,
      host: "in-memory",
      port: 2575,
    });
    await client.connect();
    const response = await client.send(MLLP_SMALL_MESSAGE);
    await client.close();
    expect(response.code).toBe("AA");
  });
});
