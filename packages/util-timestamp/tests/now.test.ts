import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatDTM } from "../src/format";
import { nowDTM } from "../src/now";
import { parseDTM } from "../src/parse";
import { Precision } from "../src/precision";
import type { DTM } from "../src/types";

const MILLISECONDS_PER_MINUTE = 60_000;

/** Sets the clock `nowDTM` reads to `instant`, an ISO 8601 UTC time. */
function at(instant: string): void {
  vi.setSystemTime(new Date(instant));
}

// Only `Date` is faked, so `new Date()` returns the instant `at` sets.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

// `vitest.config.ts` sets the host's time zone to America/New_York, which is
// UTC-5 (EST) in winter and UTC-4 (EDT) in summer.
describe("nowDTM in the host's time zone", () => {
  // 07:30:17.123 UTC in January is 02:30:17.123 EST. With no options, the
  // value goes down to the second, with the milliseconds and the offset.
  it("gives every field, the milliseconds, and the offset", () => {
    at("2024-01-15T07:30:17.123Z");
    expect(nowDTM()).toStrictEqual({
      day: 15,
      fraction: "123",
      hour: 2,
      minute: 30,
      month: 1,
      offset: -300,
      precision: "second",
      second: 17,
      year: 2024,
    });
    expect(formatDTM(nowDTM())).toBe("20240115023017.123-0500");
  });

  // 5 ms is written `.005`, not `.5`, which would mean 500 ms.
  it("writes the milliseconds as 3 digits", () => {
    at("2024-01-15T07:30:00.005Z");
    expect(formatDTM(nowDTM())).toBe("20240115023000.005-0500");
  });

  // On 2024-03-10 at 07:00 UTC, New York's clocks jump from 02:00 EST to
  // 03:00 EDT. One second before, it is 01:59:59 at -0500; at the change, it
  // is 03:00:00 at -0400. The local hour 02 never happens that day.
  it("gives the offset at each side of the change to daylight saving time", () => {
    at("2024-03-10T06:59:59Z");
    expect(formatDTM(nowDTM({ precision: Precision.Second }))).toBe(
      "20240310015959-0500"
    );
    at("2024-03-10T07:00:00Z");
    expect(formatDTM(nowDTM({ precision: Precision.Second }))).toBe(
      "20240310030000-0400"
    );
  });

  // On 2024-11-03 at 06:00 UTC, New York's clocks fall back from 02:00 EDT to
  // 01:00 EST, so 01:xx happens twice. Only the offset tells the two apart:
  // 01:59:59-0400 is followed one second later by 01:00:00-0500.
  it("gives the offset at each side of the change back to standard time", () => {
    at("2024-11-03T05:59:59Z");
    expect(formatDTM(nowDTM({ precision: Precision.Second }))).toBe(
      "20241103015959-0400"
    );
    at("2024-11-03T06:00:00Z");
    expect(formatDTM(nowDTM({ precision: Precision.Second }))).toBe(
      "20241103010000-0500"
    );
  });
});

// A `timeZone` reads the clock in that zone, whatever the host's zone is.
describe("nowDTM in a named time zone", () => {
  // The host is in New York (02:30 EST), but the value is read in UTC: 07:30,
  // offset 0.
  it("reads the fields and the offset in that zone, not the host's", () => {
    at("2024-01-15T07:30:00.123Z");
    expect(nowDTM({ timeZone: "UTC" })).toStrictEqual({
      day: 15,
      fraction: "123",
      hour: 7,
      minute: 30,
      month: 1,
      offset: 0,
      precision: "second",
      second: 0,
      year: 2024,
    });
  });

  // Kathmandu is UTC+5:45 all year: 07:30 UTC is 13:15 there.
  it("gives an offset east of UTC that is not whole hours", () => {
    at("2024-01-15T07:30:00Z");
    expect(
      formatDTM(
        nowDTM({ precision: Precision.Minute, timeZone: "Asia/Kathmandu" })
      )
    ).toBe("202401151315+0545");
  });

  // St. John's, Newfoundland, is UTC-3:30 in winter: 07:30 UTC is 04:00 there.
  it("gives an offset west of UTC that is not whole hours", () => {
    at("2024-01-15T07:30:00Z");
    expect(
      formatDTM(
        nowDTM({ precision: Precision.Minute, timeZone: "America/St_Johns" })
      )
    ).toBe("202401150400-0330");
  });

  // On 2024-03-31 at 01:00 UTC, London's clocks jump from 01:00 GMT to 02:00
  // BST. A different zone and date from the host's tests, so the named zone
  // is shown to follow its own rules.
  it("gives the offset at each side of the change to daylight saving time", () => {
    at("2024-03-31T00:59:59Z");
    expect(
      formatDTM(
        nowDTM({ precision: Precision.Second, timeZone: "Europe/London" })
      )
    ).toBe("20240331005959+0000");
    at("2024-03-31T01:00:00Z");
    expect(
      formatDTM(
        nowDTM({ precision: Precision.Second, timeZone: "Europe/London" })
      )
    ).toBe("20240331020000+0100");
  });

  // On 2024-10-27 at 01:00 UTC, London's clocks fall back from 02:00 BST to
  // 01:00 GMT: 01:59:59+0100 is followed by 01:00:00+0000.
  it("gives the offset at each side of the change back to standard time", () => {
    at("2024-10-27T00:59:59Z");
    expect(
      formatDTM(
        nowDTM({ precision: Precision.Second, timeZone: "Europe/London" })
      )
    ).toBe("20241027015959+0100");
    at("2024-10-27T01:00:00Z");
    expect(
      formatDTM(
        nowDTM({ precision: Precision.Second, timeZone: "Europe/London" })
      )
    ).toBe("20241027010000+0000");
  });

  // 05:00 UTC is midnight in New York. A 24-hour clock writes it `00`; a
  // formatter on a 12-hour clock would give 12.
  it("writes midnight as hour 00", () => {
    at("2024-01-15T05:00:00Z");
    expect(
      formatDTM(
        nowDTM({ precision: Precision.Hour, timeZone: "America/New_York" })
      )
    ).toBe("2024011500-0500");
  });

  // The second call shows that a failed zone is not cached.
  it("throws Intl's RangeError for a zone Intl does not know, every time", () => {
    expect(() => nowDTM({ timeZone: "Mars/Olympus_Mons" })).toThrow(RangeError);
    expect(() => nowDTM({ timeZone: "Mars/Olympus_Mons" })).toThrow(RangeError);
  });
});

// Every case reads 2024-01-15 02:30:45.123 EST (07:30:45.123 UTC). A precision
// keeps the fields from the year down to it and drops the milliseconds. A year,
// month, or day is a calendar date and has no offset; an hour or finer is a
// moment and keeps it.
describe("nowDTM precision", () => {
  beforeEach(() => {
    at("2024-01-15T07:30:45.123Z");
  });

  it("cuts the value to the year, without the offset", () => {
    expect(nowDTM({ precision: Precision.Year })).toStrictEqual({
      precision: "year",
      year: 2024,
    });
  });

  it("cuts the value to the month, without the offset", () => {
    expect(formatDTM(nowDTM({ precision: Precision.Month }))).toBe("202401");
  });

  it("cuts the value to the day, without the offset", () => {
    expect(formatDTM(nowDTM({ precision: Precision.Day }))).toBe("20240115");
  });

  // The hour is the first precision that names a moment, so the offset
  // starts here.
  it("cuts the value to the hour", () => {
    expect(formatDTM(nowDTM({ precision: Precision.Hour }))).toBe(
      "2024011502-0500"
    );
  });

  it("cuts the value to the minute", () => {
    expect(formatDTM(nowDTM({ precision: Precision.Minute }))).toBe(
      "202401150230-0500"
    );
  });

  it("cuts the value to the second, without the milliseconds", () => {
    expect(nowDTM({ precision: Precision.Second })).toStrictEqual({
      day: 15,
      hour: 2,
      minute: 30,
      month: 1,
      offset: -300,
      precision: "second",
      second: 45,
      year: 2024,
    });
  });
});

// `offset` overrides the default either way and keeps the fields as they are.
describe("nowDTM with the offset set", () => {
  it("leaves the offset out", () => {
    at("2024-01-15T07:30:45.123Z");
    expect(
      formatDTM(nowDTM({ offset: false, precision: Precision.Minute }))
    ).toBe("202401150230");
  });

  it("leaves the offset out in a named zone", () => {
    at("2024-01-15T07:30:45.123Z");
    expect(formatDTM(nowDTM({ offset: false, timeZone: "UTC" }))).toBe(
      "20240115073045.123"
    );
  });

  // At 03:00 UTC on 1 February it is still 31 January in New York: the offset
  // says whose calendar the date was read in.
  it("gives a date its offset with `offset: true`", () => {
    at("2024-02-01T03:00:00Z");
    expect(formatDTM(nowDTM({ offset: true, precision: Precision.Day }))).toBe(
      "20240131-0500"
    );
  });
});

// Zones with whole-hour, half-hour (St. John's, Lord Howe), and 45-minute
// (Kathmandu, Chatham) offsets. Lord Howe moves its clocks by only 30 minutes
// for daylight saving time.
const zones = fc.constantFrom(
  "UTC",
  "America/New_York",
  "America/St_Johns",
  "Europe/London",
  "Asia/Kathmandu",
  "Australia/Lord_Howe",
  "Pacific/Chatham"
);

// Any millisecond in 2000-2099, which crosses every daylight saving time
// change of those years.
const instants = fc.date({
  max: new Date("2099-12-31T23:59:59.999Z"),
  min: new Date("2000-01-01T00:00:00.000Z"),
  noInvalidDate: true,
});

/**
 * The instant `value` names: its fields read as if they were UTC, less its
 * offset. `20240115023000-0500` is 02:30 UTC less -5 h, so 07:30 UTC.
 */
function instantOf(value: DTM): number {
  const wallClock = Date.UTC(
    value.year,
    (value.month ?? 1) - 1,
    value.day,
    value.hour,
    value.minute,
    value.second,
    Number(value.fraction)
  );
  return wallClock - (value.offset ?? 0) * MILLISECONDS_PER_MINUTE;
}

/** The instant `text` names, or `undefined` when it is not a valid DTM. */
function instantIn(text: string): number | undefined {
  const result = parseDTM(text);
  return result.success ? instantOf(result.data) : undefined;
}

// The value, written as HL7v2 text and read back, names the moment it was
// taken, in any zone and on either side of a daylight saving time change.
describe("nowDTM names the current instant", () => {
  // Mutant: `offsetAt` leaves the milliseconds out of the zone's wall clock.
  // Fails on `2000-01-01T00:00:00.001Z` in `UTC`.
  it("in a named zone", () => {
    fc.assert(
      fc.property(instants, zones, (instant, timeZone) => {
        vi.setSystemTime(instant);
        expect(instantIn(formatDTM(nowDTM({ timeZone })))).toBe(
          instant.getTime()
        );
      }),
      { examples: [[new Date("2024-01-15T07:30:00.999Z"), "UTC"]] }
    );
  });

  // Mutant: `nowDTM` moves the moment back by the offset instead of forward,
  // so the fields are 10 hours off the offset. Fails on
  // `2000-01-01T00:00:00.000Z`.
  it("in the host's zone", () => {
    fc.assert(
      fc.property(instants, (instant) => {
        vi.setSystemTime(instant);
        expect(instantIn(formatDTM(nowDTM()))).toBe(instant.getTime());
      })
    );
  });

  // Two independent readings of the same zone must agree: the host's zone
  // through `Date`, and the named zone through Intl.
  //
  // Mutant: the formatter leaves out `hourCycle: "h23"`, so it reads the hour
  // on a 12-hour clock. Fails on `2000-01-01T00:00:00.000Z`.
  it("the same in the host's zone as in that zone named", () => {
    fc.assert(
      fc.property(instants, (instant) => {
        vi.setSystemTime(instant);
        expect(nowDTM({ timeZone: "America/New_York" })).toStrictEqual(
          nowDTM()
        );
      })
    );
  });
});
