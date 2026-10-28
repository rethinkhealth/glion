import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatDT,
  formatDTM,
  nowDTM,
  parseDTM,
  Precision,
} from "../../src/index";

// PID-7 (Date/Time of Birth), as an interface reads, relays, and writes it.
// Only `Date` is faked, so `vi.setSystemTime` sets the instant `nowDTM` reads.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a date of birth (PID-7)", () => {
  // HL7v2 v2.5.1 Chapter 2A, DTM: `19880705` "could be used for a birth date,
  // if the time of birth is unknown".
  //
  // A patient born on 5 July 1988 is sent with PID-7 `19880705`. It names a
  // calendar day, not a moment: it has no offset, and a receiver in any time
  // zone reads and writes 5 July 1988.
  it("is carried as the calendar day the sender wrote", () => {
    const pid7 = parseDTM("19880705");

    expect(pid7).toStrictEqual({
      data: { day: 5, month: 7, precision: "day", year: 1988 },
      success: true,
    });
    expect(pid7.success && formatDTM(pid7.data)).toBe("19880705");
  });

  // A baby is born in Chicago at 23:59 on 15 January 2004, and PID-7 gives
  // the time of birth: `200401152359-0600`. In UTC that moment is 05:59 on
  // 16 January.
  //
  // The date of birth is the day in Chicago, 15 January: the date fields as
  // the sender wrote them, without converting to UTC or to the receiver's
  // zone.
  it("is the sender's local day when the time of birth is known", () => {
    const pid7 = parseDTM("200401152359-0600");

    // The date of birth (a DT) keeps the year, month, and day as written.
    const dateOfBirth =
      pid7.success &&
      formatDT({
        day: pid7.data.day,
        month: pid7.data.month,
        precision: Precision.Day,
        year: pid7.data.year,
      });
    expect(dateOfBirth).toBe("20040115");
  });

  // The host's time zone is America/New_York, set in `vitest.config.ts`.
  //
  // A baby is born in Auckland at 09:00 on 16 January 2024 (20:00 UTC on
  // 15 January). The birth is registered by an interface engine running in
  // New York, where it is still 15:00 on 15 January.
  //
  // The date of birth is the hospital's day, 16 January. The engine must
  // name the hospital's time zone; the host's zone gives the wrong day.
  it("is read in the facility's time zone, not the host's", () => {
    vi.setSystemTime("2024-01-15T20:00:00Z");

    const pid7InAuckland = formatDTM(
      nowDTM({ precision: Precision.Day, timeZone: "Pacific/Auckland" })
    );
    expect(pid7InAuckland).toBe("20240116");

    const pid7OnTheHost = formatDTM(nowDTM({ precision: Precision.Day }));
    expect(pid7OnTheHost).toBe("20240115");
  });

  // A patient knows the month and year of their birth but not the day, as
  // can happen with a record from another country. PID-7 is `198807`, July
  // 1988. The receiver keeps it to the month: no day is invented, not even
  // the 1st.
  it("keeps a year and month without inventing a day", () => {
    const pid7 = parseDTM("198807");

    expect(pid7).toStrictEqual({
      data: { month: 7, precision: "month", year: 1988 },
      success: true,
    });
    expect(pid7.success && formatDTM(pid7.data)).toBe("198807");
  });
});
