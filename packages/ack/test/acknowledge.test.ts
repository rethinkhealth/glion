import type { Segment } from "@glion/ast";
import { m, s, f, c } from "@glion/builder";
import { toHl7v2 } from "@glion/to-hl7v2";
import { value } from "@glion/util-query";

import { acknowledge } from "../src/acknowledge";
import { AckCode, Hl7ErrorCode, Severity } from "../src/constants";
import {
  AckApplicationError,
  AckApplicationReject,
  AckCommitError,
  AckCommitReject,
} from "../src/exception";

/**
 * Helper: build a minimal ADT^A01 message AST.
 */
function buildSampleAdt() {
  return m(
    s(
      "MSH",
      f("|"),
      f("^~\\&"),
      f("SendApp"),
      f("SendFac"),
      f("RecvApp"),
      f("RecvFac"),
      f("20240101120000"),
      f(""),
      f(c("ADT"), c("A01"), c("ADT_A01")),
      f("MSG001"),
      f("P"),
      f("2.5.1")
    ),
    s("PID", f("1"), f(""), f("12345"))
  );
}

describe("acknowledge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 15, 2, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("AA (success)", () => {
    it("builds an ACK with AA code when no error is provided", () => {
      const tree = buildSampleAdt();
      const ack = acknowledge(tree, { id: "SNAPSHOT-ID-001" });
      const ack_hl7v2 = toHl7v2(ack);

      expect(ack.type).toBe("root");
      expect(ack_hl7v2).toEqual(
        "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000||ACK^A01|SNAPSHOT-ID-001|P|2.5.1\r" +
          "MSA|AA|MSG001"
      );
    });

    it("echoes the original trigger event in the ACK MSH-9.2", () => {
      const tree = m(
        s(
          "MSH",
          f("|"),
          f("^~\\&"),
          f("App"),
          f("Fac"),
          f(""),
          f(""),
          f("20240101"),
          f(""),
          f(c("ORM"), c("O01")),
          f("CTL999"),
          f("P"),
          f("2.5.1")
        )
      );

      const ack = acknowledge(tree);
      const msh_9 = value(ack, "MSH-9.2")?.value;

      expect(msh_9).toEqual("O01");
    });

    it("handles missing trigger event gracefully", () => {
      const tree = m(
        s(
          "MSH",
          f("|"),
          f("^~\\&"),
          f("App"),
          f("Fac"),
          f(""),
          f(""),
          f("20240101"),
          f(""),
          f(c("ADT")), // missing ADT Event Type (A01)
          f("CTL100"),
          f("P"),
          f("2.3")
        )
      );

      const ack = acknowledge(tree);

      expect(value(ack, "MSH-9.1")?.value).toEqual("ACK");
      expect(value(ack, "MSH-9.2")).toBeNull();
    });

    it("only produces MSH and MSA segments for success", () => {
      const tree = buildSampleAdt();
      const ack = acknowledge(tree);

      expect(ack.children).toHaveLength(2);
      expect((ack.children[0] as Segment).name).toBe("MSH");
      expect((ack.children[1] as Segment).name).toBe("MSA");
    });
  });

  describe("AE (error)", () => {
    it("builds an ACK with AE code and ERR segment from AckApplicationError", () => {
      const tree = buildSampleAdt();
      const error = new AckApplicationError("Validation failed", {
        errorCode: Hl7ErrorCode.ApplicationInternalError,
        severity: Severity.Error,
      });

      const ack = acknowledge(tree, {
        error,
        id: "ACK-ERR-001",
      });
      const ack_hl7v2 = toHl7v2(ack);
      const segments = ack_hl7v2.split("\r");

      expect(ack.children).toHaveLength(3);
      expect(value(ack, "MSA-1")?.value).toEqual(AckCode.ApplicationError);
      expect(value(ack, "MSA-2")?.value).toEqual("MSG001");
      expect(value(ack, "MSA-3")?.value).toEqual("Validation failed");

      expect(segments).toEqual([
        "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000||ACK^A01|ACK-ERR-001|P|2.5.1",
        "MSA|AE|MSG001|Validation failed",
        "ERR|||207|E",
      ]);
    });

    it("omits ERR segment when includeErrSegment is false", () => {
      const tree = buildSampleAdt();
      const error = new AckApplicationError("Something failed", {
        errorCode: Hl7ErrorCode.ApplicationInternalError,
      });

      const ack = acknowledge(tree, { error, includeErrSegment: false });
      const segments = toHl7v2(ack).split("\r");

      expect(segments).toHaveLength(2);
      expect(segments[1]).toEqual("MSA|AE|MSG001|Something failed");
    });
  });

  describe("AR (reject)", () => {
    it("builds an ACK with AR code and ERR segment from AckApplicationReject", () => {
      const tree = buildSampleAdt();
      const error = new AckApplicationReject("Unsupported", {
        errorCode: Hl7ErrorCode.UnsupportedMessageType,
        severity: Severity.Error,
      });

      const ack = acknowledge(tree, {
        error,
        id: "ACK-REJ-001",
      });
      const segments = toHl7v2(ack).split("\r");

      expect(ack.children).toHaveLength(3);
      expect(segments).toEqual([
        "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000||ACK^A01|ACK-REJ-001|P|2.5.1",
        "MSA|AR|MSG001|Unsupported",
        "ERR|||200|E",
      ]);
    });
  });

  describe("optional sending", () => {
    it("uses original receiving app/facility when sending is omitted", () => {
      const tree = buildSampleAdt();
      const ack = acknowledge(tree, { id: "ACK-SEND-001" });
      const ack_hl7v2 = toHl7v2(ack);

      expect(value(ack, "MSH-3")?.value).toEqual("RecvApp");
      expect(value(ack, "MSH-4")?.value).toEqual("RecvFac");
      expect(value(ack, "MSH-5")?.value).toEqual("SendApp");
      expect(value(ack, "MSH-6")?.value).toEqual("SendFac");
      expect(ack_hl7v2).toEqual(
        "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000||ACK^A01|ACK-SEND-001|P|2.5.1\r" +
          "MSA|AA|MSG001"
      );
    });

    it("uses explicit sending when provided", () => {
      const tree = buildSampleAdt();
      const ack = acknowledge(tree, {
        id: "ACK-SEND-002",
        sending: { application: "Custom_HERE", facility: "Facility_HERE" },
      });

      expect(value(ack, "MSH-3")?.value).toEqual("Custom_HERE");
      expect(value(ack, "MSH-4")?.value).toEqual("Facility_HERE");
    });
  });

  describe("processingId", () => {
    it("defaults to original message MSH-11 value", () => {
      const tree = buildSampleAdt();
      const ack = acknowledge(tree);

      expect(value(ack, "MSH-11")?.value).toEqual("P");
    });

    it("uses explicit processingId when provided", () => {
      const tree = buildSampleAdt();
      const ack = acknowledge(tree, { processingId: "T" });

      expect(value(ack, "MSH-11")?.value).toEqual("T");
    });
  });

  describe("MSH-10 control ID", () => {
    it("auto-generates a unique MSH-10 when id is omitted", () => {
      const tree = buildSampleAdt();
      const ack1 = acknowledge(tree);
      const ack2 = acknowledge(tree);

      const msh10a = value(ack1, "MSH-10")?.value;
      const msh10b = value(ack2, "MSH-10")?.value;

      expect(msh10a).toHaveLength(20);
      expect(msh10b).toHaveLength(20);
      expect(msh10a).not.toBe(msh10b);
    });

    it("uses explicit id as MSH-10 when provided", () => {
      const tree = buildSampleAdt();
      const ack = acknowledge(tree, { id: "MY-CUSTOM-ID" });

      expect(value(ack, "MSH-10")?.value).toEqual("MY-CUSTOM-ID");
    });
  });

  describe("CA (commit accept)", () => {
    it("builds an ACK with CA code when successCode is CA and no error", () => {
      const tree = buildSampleAdt();
      const ack = acknowledge(tree, {
        id: "ACK-CA-001",
        successCode: AckCode.CommitAccept,
      });
      const ack_hl7v2 = toHl7v2(ack);

      expect(ack_hl7v2).toEqual(
        "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000||ACK^A01|ACK-CA-001|P|2.5.1\r" +
          "MSA|CA|MSG001"
      );
    });

    it("still defaults to AA when successCode is omitted", () => {
      const tree = buildSampleAdt();
      const ack = acknowledge(tree, { id: "ACK-AA-001" });

      expect(value(ack, "MSA-1")?.value).toEqual(AckCode.ApplicationAccept);
    });
  });

  describe("CE (commit error)", () => {
    it("builds an ACK with CE code from AckCommitError", () => {
      const tree = buildSampleAdt();
      const error = new AckCommitError("Commit failed", {
        errorCode: Hl7ErrorCode.ApplicationInternalError,
        severity: Severity.Error,
      });

      const ack = acknowledge(tree, { error, id: "ACK-CE-001" });
      const segments = toHl7v2(ack).split("\r");

      expect(segments).toEqual([
        "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000||ACK^A01|ACK-CE-001|P|2.5.1",
        "MSA|CE|MSG001|Commit failed",
        "ERR|||207|E",
      ]);
    });
  });

  describe("CR (commit reject)", () => {
    it("builds an ACK with CR code from AckCommitReject", () => {
      const tree = buildSampleAdt();
      const error = new AckCommitReject("Message rejected at commit", {
        errorCode: Hl7ErrorCode.UnsupportedMessageType,
        severity: Severity.Error,
      });

      const ack = acknowledge(tree, { error, id: "ACK-CR-001" });
      const segments = toHl7v2(ack).split("\r");

      expect(segments).toEqual([
        "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000||ACK^A01|ACK-CR-001|P|2.5.1",
        "MSA|CR|MSG001|Message rejected at commit",
        "ERR|||200|E",
      ]);
    });
  });

  // https://github.com/rethinkhealth/hl7v2/issues/489
  it("extracts version from composite VID in MSH-12 (2.5.1^USA^ISO)", () => {
    function mshVid(version: string) {
      return s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f("SendApp"),
        f("SendFac"),
        f("RecvApp"),
        f("RecvFac"),
        f("20240101120000"),
        f(""),
        f(c("ADT"), c("A01"), c("ADT_A01")),
        f("MSG001"),
        f("P"),
        f(c(version), c("USA"), c("ISO")) // VID composite
      );
    }

    const tree = m(mshVid("2.5.1"), s("PID", f("1"), f(""), f("12345")));
    const ack = acknowledge(tree, { id: "ACK-VID-001" });
    const ackHl7v2 = toHl7v2(ack);

    expect(ackHl7v2).toContain("2.5.1");
  });
});
