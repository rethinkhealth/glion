import { describe, expect, it } from "vitest";

import { segmentTerminatorAt } from "../src/segment-terminators";

const LINE_BREAKS = true;
const CARRIAGE_RETURN_ONLY = false;

describe(segmentTerminatorAt, () => {
  describe("with line breaks", () => {
    it("reads a carriage return, the segment terminator HL7v2 requires", () => {
      expect(segmentTerminatorAt("PID|1\rOBX", 5, LINE_BREAKS)).toBe("\r");
    });

    it("reads a carriage return and a line feed as one segment terminator", () => {
      expect(segmentTerminatorAt("PID|1\r\nOBX", 5, LINE_BREAKS)).toBe("\r\n");
    });

    it("reads a line feed", () => {
      expect(segmentTerminatorAt("PID|1\nOBX", 5, LINE_BREAKS)).toBe("\n");
    });

    it("reads no segment terminator at any other character, or at the end of the input", () => {
      expect(segmentTerminatorAt("PID|1", 3, LINE_BREAKS)).toBeUndefined();
      expect(segmentTerminatorAt("PID|1$OBX", 5, LINE_BREAKS)).toBeUndefined();
      expect(segmentTerminatorAt("PID|1", 5, LINE_BREAKS)).toBeUndefined();
    });
  });

  describe("without line breaks", () => {
    it("reads a carriage return", () => {
      expect(segmentTerminatorAt("PID|1\rOBX", 5, CARRIAGE_RETURN_ONLY)).toBe(
        "\r"
      );
    });

    it("reads the carriage return of a carriage return and a line feed alone", () => {
      expect(segmentTerminatorAt("PID|1\r\nOBX", 5, CARRIAGE_RETURN_ONLY)).toBe(
        "\r"
      );
    });

    it("reads no segment terminator at a line feed", () => {
      expect(
        segmentTerminatorAt("PID|1\nOBX", 5, CARRIAGE_RETURN_ONLY)
      ).toBeUndefined();
    });
  });
});
