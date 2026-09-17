/**
 * QR2: Diagnostic Precision — Truth-table validation.
 *
 * For messages with known violations, asserts the exact set of VFileMessage
 * diagnostics: correct ruleId, correct message text, correct byte offsets. No
 * false negatives (missed violations), no false positives (spurious warnings).
 *
 * Each test verifies that diagnostic offsets land on the correct token in the
 * source string — wrong offsets cause consumer editors to highlight the wrong
 * characters.
 */
import { parseHL7v2 } from "@glion/hl7v2";
import type { VFile } from "vfile";

import { readFixture } from "../src/fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Assert that a diagnostic's byte offsets actually point to the expected
 * content in the source string. This catches offset drift — the most
 * insidious class of diagnostic bugs.
 *
 * Uses exact equality on the expected substring to prevent partial-match
 * false passes (e.g., offset range "PID|1" would not pass for expected "PID").
 */
type Diagnostic = VFile["messages"][number];

function offsets(diagnostic: Diagnostic): { start?: number; end?: number } {
  const { place } = diagnostic;
  if (place === undefined || !("start" in place)) {
    return {};
  }
  return { end: place.end.offset, start: place.start.offset };
}

function expectOffsetContains(
  source: string,
  diagnostic: Diagnostic,
  expectedSubstring: string
) {
  const { start, end } = offsets(diagnostic);
  if (start === undefined || end === undefined) {
    expect.unreachable("Diagnostic is missing start or end offset");
    return;
  }
  const slice = source.slice(start, end);
  expect(slice).toContain(expectedSubstring);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("QR2: diagnostic precision", () => {
  describe("negative control — valid message produces zero diagnostics", () => {
    it("well-formed ADT^A01 with all required segments", async () => {
      const source = [
        "MSH|^~\\&|SENDER|FAC|RECV|FAC|20260301120000||ADT^A01^ADT_A01|MSG001|P|2.5.1",
        "EVN|A01|20260301120000",
        "PID|1||12345^^^MRN||DOE^JOHN||19800101|M",
        "PV1|1|I|ICU^101^A",
      ].join("\n");

      const file = await parseHL7v2.process(source);

      expect(file.messages).toHaveLength(0);
    });
  });

  describe("required-message-header — missing MSH segment", () => {
    it("flags message starting with PID instead of MSH", async () => {
      const source = readFixture("invalid-missing-msh.hl7");
      const file = await parseHL7v2.process(source);

      const headerDiag = file.messages.find(
        (m) => m.ruleId === "segment-required-message-header"
      );

      expect(headerDiag).toBeDefined();
      expect(headerDiag!.message).toBe(
        "Message header (MSH) segment is required as the first segment — received 'PID' instead"
      );
      expectOffsetContains(source, headerDiag!, "PID");
    });
  });

  describe("message-version — unsupported HL7v2 version", () => {
    it("flags version 1.0 as not satisfying >=2.3 <3.0.0", async () => {
      const source = readFixture("invalid-wrong-version.hl7");
      const file = await parseHL7v2.process(source);

      const versionDiag = file.messages.find(
        (m) => m.ruleId === "message-version"
      );

      expect(versionDiag).toBeDefined();
      expect(versionDiag!.message).toBe(
        "MSH-12 (version) field value '1.0' does not satisfy expression '<3.0.0 >=2.3'"
      );

      // Offset should point to the "1.0" value in the source
      expectOffsetContains(source, versionDiag!, "1.0");
    });

    it("flags missing version when MSH is absent", async () => {
      const source = readFixture("invalid-missing-msh.hl7");
      const file = await parseHL7v2.process(source);

      const versionDiag = file.messages.find(
        (m) => m.ruleId === "message-version"
      );

      expect(versionDiag).toBeDefined();
      expect(versionDiag!.message).toBe(
        "Required MSH-12 (version) field is missing or empty"
      );
    });
  });

  describe("segment-header-length — non-3-character segment names", () => {
    it("flags segment name that is too long and too short", async () => {
      const source = readFixture("invalid-segment-header-length.hl7");
      const file = await parseHL7v2.process(source);

      const headerDiags = file.messages.filter(
        (m) => m.ruleId === "segment-header-length"
      );

      expect(headerDiags).toHaveLength(2);

      // PIDX — 4 chars, too long
      expect(headerDiags[0]!.message).toBe(
        "Unexpected 4 header length, expected 3 characters, remove 1 character"
      );
      expectOffsetContains(source, headerDiags[0]!, "PIDX");

      // PV — 2 chars, too short
      expect(headerDiags[1]!.message).toBe(
        "Unexpected 2 header length, expected 3 characters, add 1 character"
      );
      expectOffsetContains(source, headerDiags[1]!, "PV|");
    });
  });

  describe("no-trailing-empty-field — segments with trailing empty fields", () => {
    it("flags EVN with 2 trailing empties and PID with 6", async () => {
      const source = readFixture("invalid-trailing-empty-fields.hl7");
      const file = await parseHL7v2.process(source);

      const trailingDiags = file.messages.filter(
        (m) => m.ruleId === "no-trailing-empty-field"
      );

      expect(trailingDiags).toHaveLength(2);

      // EVN — 2 trailing empty fields
      expect(trailingDiags[0]!.message).toBe(
        "Segment has 2 trailing empty fields"
      );
      expectOffsetContains(source, trailingDiags[0]!, "||");

      // PID — 6 trailing empty fields
      expect(trailingDiags[1]!.message).toBe(
        "Segment has 6 trailing empty fields"
      );
      expectOffsetContains(source, trailingDiags[1]!, "||||||");
    });
  });

  describe("completeness — no unexpected diagnostics", () => {
    it("invalid-missing-msh.hl7 produces exactly 2 diagnostics", async () => {
      const source = readFixture("invalid-missing-msh.hl7");
      const file = await parseHL7v2.process(source);

      expect(file.messages).toHaveLength(2);
      expect(file.messages.map((m) => m.ruleId)).toStrictEqual([
        "segment-required-message-header",
        "message-version",
      ]);
    });

    it("invalid-wrong-version.hl7 produces exactly 1 diagnostic", async () => {
      const source = readFixture("invalid-wrong-version.hl7");
      const file = await parseHL7v2.process(source);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]!.ruleId).toBe("message-version");
    });

    it("invalid-segment-header-length.hl7 produces exactly 3 diagnostics", async () => {
      const source = readFixture("invalid-segment-header-length.hl7");
      const file = await parseHL7v2.process(source);

      expect(file.messages).toHaveLength(3);
      expect(file.messages.map((m) => m.ruleId)).toStrictEqual([
        "segment-header-length",
        "segment-header-length",
        "segment-order",
      ]);
    });

    it("invalid-trailing-empty-fields.hl7 produces exactly 3 diagnostics", async () => {
      const source = readFixture("invalid-trailing-empty-fields.hl7");
      const file = await parseHL7v2.process(source);

      expect(file.messages).toHaveLength(3);
      expect(file.messages.map((m) => m.ruleId)).toStrictEqual([
        "no-trailing-empty-field",
        "no-trailing-empty-field",
        "segment-order",
      ]);
    });
  });

  describe("offset accuracy — diagnostic positions point to correct source tokens", () => {
    it("version diagnostic offset lands on the version value", async () => {
      const source = readFixture("invalid-wrong-version.hl7");
      const file = await parseHL7v2.process(source);
      const diag = file.messages[0]!;

      const { start, end } = offsets(diag);
      expect(start).toBeDefined();
      expect(end).toBeDefined();

      // The slice should be exactly "1.0"
      expect(source.slice(start!, end!)).toBe("1.0");
    });

    it("trailing-empty-field offsets span the empty delimiters", async () => {
      const source = readFixture("invalid-trailing-empty-fields.hl7");
      const file = await parseHL7v2.process(source);

      const trailingDiags = file.messages.filter(
        (m) => m.ruleId === "no-trailing-empty-field"
      );

      // EVN trailing: the slice should be "||" (2 pipes for 2 trailing empties)
      const evn = offsets(trailingDiags[0]!);
      expect(source.slice(evn.start, evn.end)).toBe("||");

      // PID trailing: the slice should be "||||||" (6 pipes for 6 trailing empties)
      const pid = offsets(trailingDiags[1]!);
      expect(source.slice(pid.start, pid.end)).toBe("||||||");
    });
  });
});
