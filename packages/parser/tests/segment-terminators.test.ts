import { describe, expect, it } from "vitest";

import { segmentTerminatorAt } from "../src/segment-terminators";

const LINE_BREAKS = { lineBreaks: true, segment: "\r" };
const SEGMENT_DELIMITER_ONLY = { lineBreaks: false, segment: "\r" };

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

    it("reads another segment delimiter, and still a carriage return, a carriage return and a line feed, and a line feed", () => {
      const dollar = { lineBreaks: true, segment: "$" };

      expect(segmentTerminatorAt("PID|1$OBX", 5, dollar)).toBe("$");
      expect(segmentTerminatorAt("PID|1\rOBX", 5, dollar)).toBe("\r");
      expect(segmentTerminatorAt("PID|1\r\nOBX", 5, dollar)).toBe("\r\n");
      expect(segmentTerminatorAt("PID|1\nOBX", 5, dollar)).toBe("\n");
    });

    it("reads no segment terminator at any other character, or at the end of the input", () => {
      expect(segmentTerminatorAt("PID|1", 3, LINE_BREAKS)).toBeUndefined();
      expect(segmentTerminatorAt("PID|1", 5, LINE_BREAKS)).toBeUndefined();
    });
  });

  describe("without line breaks", () => {
    it("reads a carriage return", () => {
      expect(segmentTerminatorAt("PID|1\rOBX", 5, SEGMENT_DELIMITER_ONLY)).toBe(
        "\r"
      );
    });

    it("reads the carriage return of a carriage return and a line feed alone", () => {
      expect(
        segmentTerminatorAt("PID|1\r\nOBX", 5, SEGMENT_DELIMITER_ONLY)
      ).toBe("\r");
    });

    it("reads no segment terminator at a line feed", () => {
      expect(
        segmentTerminatorAt("PID|1\nOBX", 5, SEGMENT_DELIMITER_ONLY)
      ).toBeUndefined();
    });

    it("reads another segment delimiter, and still a carriage return", () => {
      const dollar = { lineBreaks: false, segment: "$" };

      expect(segmentTerminatorAt("PID|1$OBX", 5, dollar)).toBe("$");
      expect(segmentTerminatorAt("PID|1\rOBX", 5, dollar)).toBe("\r");
      expect(segmentTerminatorAt("PID|1\nOBX", 5, dollar)).toBeUndefined();
    });
  });
});
