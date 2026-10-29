import { describe, expect, it } from "vitest";

import { segmentTerminatorAt } from "../src/segment-terminators";

describe(segmentTerminatorAt, () => {
  it("reads the segment delimiter", () => {
    expect(segmentTerminatorAt("PID|1\rOBX", 5, "\r")).toBe("\r");
  });

  it("reads a carriage return and a line feed as one segment terminator", () => {
    expect(segmentTerminatorAt("PID|1\r\nOBX", 5, "\r")).toBe("\r\n");
  });

  it("reads a line feed", () => {
    expect(segmentTerminatorAt("PID|1\nOBX", 5, "\r")).toBe("\n");
  });

  it("reads another segment delimiter, and still a carriage return and a line feed, and a line feed", () => {
    expect(segmentTerminatorAt("PID|1$OBX", 5, "$")).toBe("$");
    expect(segmentTerminatorAt("PID|1\r\nOBX", 5, "$")).toBe("\r\n");
    expect(segmentTerminatorAt("PID|1\nOBX", 5, "$")).toBe("\n");
  });

  it("reads no segment terminator at a carriage return alone when the segment delimiter is another character", () => {
    expect(segmentTerminatorAt("PID|a\rb", 5, "$")).toBeUndefined();
  });

  it("reads no segment terminator at any other character, or at the end of the input", () => {
    expect(segmentTerminatorAt("PID|1", 3, "\r")).toBeUndefined();
    expect(segmentTerminatorAt("PID|1", 5, "\r")).toBeUndefined();
  });
});
