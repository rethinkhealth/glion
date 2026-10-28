import { describe, expect, it } from "vitest";

import { formatDTM, formatTM, parseDTM, parseTM } from "../../src/index";

// An interface engine receives a message, reads its timestamps, and sends
// them on to another system. What it sends must be exactly what the sender
// wrote: a value to the minute stays to the minute (no `00` seconds added),
// `.10` keeps its trailing zero, and the offset is not converted.
//
// Each value below is read with `parseDTM` or `parseTM` and written back with
// `formatDTM` or `formatTM`; the text that comes out is the text that went
// in. The values are the DTM and TM examples of HL7v2 v2.5.1 Chapter 2A,
// plus two from lab results. The chapter prints Amsterdam's offset as
// `+010`; its own description says `+0100`.
describe("a value relayed by an interface engine", () => {
  it.each([
    ["19760704010159-0500", "1:01:59 on 4 July 1976, EST"],
    ["19760704010159-0400", "1:01:59 on 4 July 1976, EDT"],
    ["198807050000", "midnight starting 5 July 1988, the sender's zone"],
    ["19880705", "a birth date with no time of birth"],
    ["19981004010159+0100", "1:01:59 on 4 October 1998, Amsterdam"],
    ["199904", "April 1999"],
    ["20240115143000.10", "an OBX-14 with a fraction ending in zero"],
    ["202401151430-0500", "an OBX-14 to the minute"],
  ])("sends the DTM %j, %s, as it was received", (received) => {
    const value = parseDTM(received);
    const sent = value.success && formatDTM(value.data);

    expect(sent).toBe(received);
  });

  it.each([
    ["0000", "midnight"],
    ["235959+1100", "1 second before midnight, 11 hours ahead of UTC"],
    ["0800", "8 AM, the sender's local time"],
    ["093544.2312", "44.2312 seconds after 9:35 AM"],
    ["13", "1 PM, to the hour"],
  ])("sends the TM %j, %s, as it was received", (received) => {
    const value = parseTM(received);
    const sent = value.success && formatTM(value.data);

    expect(sent).toBe(received);
  });
});
