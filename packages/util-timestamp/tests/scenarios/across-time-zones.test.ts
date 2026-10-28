import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatDTM, nowDTM, parseDTM, Precision } from "../../src/index";
import type { DTM } from "../../src/index";

// Timestamps written in one time zone and read in another, as between a
// sender and a receiver, or a message and its acknowledgment. Each test names
// its time zones, so none depends on the host's. Only `Date` is faked, so
// `vi.setSystemTime` sets the instant `nowDTM` reads.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

// The DTM `text` gives. A test fails here when `text` does not parse.
function read(text: string): DTM {
  const result = parseDTM(text);
  if (!result.success) {
    throw new Error(`${text} does not parse: ${result.issue.code}.`);
  }
  return result.data;
}

// The instant a DTM starts at, in milliseconds since 1970: its fields, moved
// by its offset to UTC. This is what a receiver computes to order or compare
// two timestamps; the package itself names no instants (#1134). A fourth
// fraction digit is rounded to the millisecond.
function instantOf(value: DTM): number {
  if (value.offset === undefined) {
    throw new Error("A DTM with no offset names no instant.");
  }
  const sign = value.offset.startsWith("-") ? -1 : 1;
  const offsetMinutes =
    sign *
    (Number(value.offset.slice(1, 3)) * 60 + Number(value.offset.slice(3)));
  // `Date.UTC` reads the years 0 to 99 as 1900 to 1999; `setUTCFullYear`
  // does not.
  const local = new Date(0);
  local.setUTCFullYear(value.year, (value.month ?? 1) - 1, value.day ?? 1);
  local.setUTCHours(
    value.hour ?? 0,
    value.minute ?? 0,
    value.second ?? 0,
    Math.round(Number(`0.${value.fraction ?? "0"}`) * 1000)
  );
  return local.getTime() - offsetMinutes * 60_000;
}

describe("a message and its acknowledgment (MSH-7)", () => {
  // A client in Tokyo sends an order at 16:00:00 UTC, which is 01:00 on
  // 16 January in Tokyo. A server in New York acknowledges it 2.25 seconds
  // later, at 16:00:02.25 UTC, which is 11:00 on 15 January in New York.
  // Each writes MSH-7 in its own time zone.
  //
  // Compared as text, the acknowledgment (15 January) comes before the order
  // (16 January). Compared as instants, it comes 2.25 seconds after.
  it("orders the acknowledgment after the order by instant, not by text", () => {
    vi.setSystemTime("2024-01-15T16:00:00.000Z");
    const orderMSH7 = formatDTM(nowDTM({ timeZone: "Asia/Tokyo" }));
    vi.setSystemTime("2024-01-15T16:00:02.250Z");
    const ackMSH7 = formatDTM(nowDTM({ timeZone: "America/New_York" }));

    expect(orderMSH7).toBe("20240116010000.000+0900");
    expect(ackMSH7).toBe("20240115110002.250-0500");

    // As text, the acknowledgment sorts first.
    expect(ackMSH7 < orderMSH7).toBe(true);

    // As instants, it is 2,250 ms after the order.
    expect(instantOf(read(ackMSH7)) - instantOf(read(orderMSH7))).toBe(2250);
  });

  // HL7v2, MSH-7: "If the time zone is specified, it will be used throughout
  // the message as the default time zone."
  //
  // A lab in New York sends a result. MSH-7 says the message was created at
  // 15:00 at -0500. OBX-14 says the sample was observed at 14:30, with no
  // offset, so it is 14:30 at -0500 too: 19:30 UTC.
  it("reads a time with no offset as having none, so MSH-7's offset can apply", () => {
    const messageCreated = read("20240115150000-0500"); // MSH-7
    const sampleObserved = read("202401151430"); // OBX-14

    // The package does not guess an offset: not the host's, not UTC.
    expect(sampleObserved.offset).toBeUndefined();

    // The receiver applies MSH-7's offset, as HL7v2 says.
    const observedAtMessageOffset = {
      ...sampleObserved,
      offset: messageCreated.offset,
    };
    expect(instantOf(observedAtMessageOffset)).toBe(
      Date.parse("2024-01-15T19:30:00Z")
    );
  });
});

describe("a facility in another time zone", () => {
  // An interface engine runs in a cloud region on UTC and writes EVN-2
  // (Recorded Date/Time) for a clinic in Chicago. At 15:45 UTC it is 09:45
  // in Chicago, at -0600.
  //
  // Written in the clinic's zone, EVN-2 shows the clinic's wall clock;
  // written in UTC, it shows UTC's. Both name the same moment.
  it("names the same instant from the facility's zone and from UTC", () => {
    vi.setSystemTime("2024-01-15T15:45:00Z");
    const evn2InChicago = formatDTM(
      nowDTM({ precision: Precision.Minute, timeZone: "America/Chicago" })
    );
    const evn2InUTC = formatDTM(
      nowDTM({ precision: Precision.Minute, timeZone: "UTC" })
    );

    expect(evn2InChicago).toBe("202401150945-0600");
    expect(evn2InUTC).toBe("202401151545-0000");
    expect(instantOf(read(evn2InChicago))).toBe(instantOf(read(evn2InUTC)));
  });

  // Some zones are not a whole number of hours from UTC. At 13:00 UTC it is
  // 18:30 in India (+0530), 18:45 in Nepal (+0545), and 02:45 the next day
  // on the Chatham Islands (+1345, their summer). The offset is written in
  // hours and minutes, and reading it back gives 13:00 UTC again.
  it.each([
    ["Asia/Kolkata", "202401151830+0530"],
    ["Asia/Kathmandu", "202401151845+0545"],
    ["Pacific/Chatham", "202401160245+1345"],
  ])("writes the offset of %s in hours and minutes", (timeZone, expected) => {
    vi.setSystemTime("2024-01-15T13:00:00Z");
    const msh7 = formatDTM(nowDTM({ precision: Precision.Minute, timeZone }));

    expect(msh7).toBe(expected);
    expect(instantOf(read(msh7))).toBe(Date.parse("2024-01-15T13:00:00Z"));
  });

  // HL7v2 v2.9: `-0000` means UTC with no local time zone known, and `+0000`
  // a local time zone that happens to be at offset zero.
  //
  // At 12:00 UTC in January, a server on UTC writes 1200-0000, and a
  // hospital in London (on GMT in winter) writes 1200+0000. Both name the
  // same moment, and the receiver can still tell which kind of sender wrote
  // each.
  it("keeps -0000 from a UTC server apart from +0000 in London", () => {
    vi.setSystemTime("2024-01-15T12:00:00Z");
    const serverMSH7 = read(
      formatDTM(nowDTM({ precision: Precision.Minute, timeZone: "UTC" }))
    );
    const londonMSH7 = read(
      formatDTM(
        nowDTM({ precision: Precision.Minute, timeZone: "Europe/London" })
      )
    );

    expect(serverMSH7.offset).toBe("-0000");
    expect(londonMSH7.offset).toBe("+0000");
    expect(instantOf(serverMSH7)).toBe(instantOf(londonMSH7));
  });
});

describe("a change to or from daylight saving time", () => {
  // On 3 November 2024, New York's clocks go back at 02:00 EDT to 01:00 EST,
  // so 01:30 happens twice:
  //
  // - 05:30 UTC is the first 01:30, in EDT (-0400): a patient is admitted.
  // - 06:30 UTC is the second 01:30, in EST (-0500): the patient is
  //   transferred.
  //
  // Both EVN-2 values read 01:30. Only the offset shows that the transfer
  // came an hour after the admission.
  it("tells the two 01:30s of the change apart by their offsets", () => {
    vi.setSystemTime("2024-11-03T05:30:00Z");
    const admittedEVN2 = formatDTM(
      nowDTM({ precision: Precision.Second, timeZone: "America/New_York" })
    );
    vi.setSystemTime("2024-11-03T06:30:00Z");
    const transferredEVN2 = formatDTM(
      nowDTM({ precision: Precision.Second, timeZone: "America/New_York" })
    );

    expect(admittedEVN2).toBe("20241103013000-0400");
    expect(transferredEVN2).toBe("20241103013000-0500");
    expect(
      instantOf(read(transferredEVN2)) - instantOf(read(admittedEVN2))
    ).toBe(3_600_000);
  });

  // HL7v2 v2.5.1 Chapter 2A gives this pair as its own examples: 01:01:59 on
  // 4 July 1976 in EST (-0500) and in EDT (-0400). The same wall-clock time
  // at two offsets is two moments, an hour apart.
  it("reads EST and EDT at the same local time as an hour apart", () => {
    const inEST = read("19760704010159-0500");
    const inEDT = read("19760704010159-0400");

    expect(instantOf(inEST) - instantOf(inEDT)).toBe(3_600_000);
  });
});
