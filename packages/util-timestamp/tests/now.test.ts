import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TimestampOffsetError } from "../src/errors";
import { formatDTM } from "../src/format";
import { nowDTM } from "../src/now";
import { Precision } from "../src/precision";

// Only `Date` is faked, so `new Date()` returns the instant
// `vi.setSystemTime` sets.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// `vitest.config.ts` sets the host's time zone to America/New_York, which is
// UTC-5 (EST) in winter and UTC-4 (EDT) in summer.
describe("nowDTM in the host's time zone", () => {
  // 07:30:17.123 UTC in January is 02:30:17.123 EST. With no options, the
  // precision is `fraction`: every field, the milliseconds, and the offset.
  it("gives every field, the milliseconds, and the offset", () => {
    vi.setSystemTime("2024-01-15T07:30:17.123Z");
    expect(nowDTM()).toStrictEqual({
      day: 15,
      fraction: "123",
      hour: 2,
      minute: 30,
      month: 1,
      offset: "-0500",
      precision: "fraction",
      second: 17,
      year: 2024,
    });
    expect(formatDTM(nowDTM())).toBe("20240115023017.123-0500");
  });

  // 5 ms is written `.005`, not `.5`, which would mean 500 ms.
  it("writes the milliseconds as 3 digits", () => {
    vi.setSystemTime("2024-01-15T07:30:00.005Z");
    expect(formatDTM(nowDTM())).toBe("20240115023000.005-0500");
  });

  // On 2024-03-10 at 07:00 UTC, New York's clocks jump from 02:00 EST to
  // 03:00 EDT. One second before, it is 01:59:59 at -0500; at the change, it
  // is 03:00:00 at -0400. The local hour 02 never happens that day.
  it("gives the offset at each side of the change to daylight saving time", () => {
    vi.setSystemTime("2024-03-10T06:59:59Z");
    expect(formatDTM(nowDTM({ precision: Precision.Second }))).toBe(
      "20240310015959-0500"
    );
    vi.setSystemTime("2024-03-10T07:00:00Z");
    expect(formatDTM(nowDTM({ precision: Precision.Second }))).toBe(
      "20240310030000-0400"
    );
  });

  // On 2024-11-03 at 06:00 UTC, New York's clocks fall back from 02:00 EDT to
  // 01:00 EST, so 01:xx happens twice. Only the offset tells the two apart:
  // 01:59:59-0400 is followed one second later by 01:00:00-0500.
  it("gives the offset at each side of the change back to standard time", () => {
    vi.setSystemTime("2024-11-03T05:59:59Z");
    expect(formatDTM(nowDTM({ precision: Precision.Second }))).toBe(
      "20241103015959-0400"
    );
    vi.setSystemTime("2024-11-03T06:00:00Z");
    expect(formatDTM(nowDTM({ precision: Precision.Second }))).toBe(
      "20241103010000-0500"
    );
  });
});

// A `timeZone` reads the clock in that zone, whatever the host's zone is.
describe("nowDTM in a named time zone", () => {
  // The host is in New York (02:30 EST), but the value is read in UTC: 07:30.
  // `UTC` is UTC with no local time zone, so the offset is `-0000`.
  it("reads the fields and the offset in that zone, not the host's", () => {
    vi.setSystemTime("2024-01-15T07:30:00.123Z");
    expect(nowDTM({ timeZone: "UTC" })).toStrictEqual({
      day: 15,
      fraction: "123",
      hour: 7,
      minute: 30,
      month: 1,
      offset: "-0000",
      precision: "fraction",
      second: 0,
      year: 2024,
    });
  });

  // Only the name `UTC` gives `-0000`. Another name of UTC, London in winter,
  // and Abidjan all year are at offset zero and give `+0000`, as a host whose
  // time zone is UTC does.
  it.each(["Etc/UTC", "GMT", "Europe/London", "Africa/Abidjan"])(
    "writes offset zero as +0000 in %s",
    (timeZone) => {
      vi.setSystemTime("2024-01-15T07:30:00Z");
      expect(formatDTM(nowDTM({ precision: Precision.Minute, timeZone }))).toBe(
        "202401150730+0000"
      );
    }
  );

  // Kathmandu is UTC+5:45 all year: 07:30 UTC is 13:15 there.
  it("gives an offset east of UTC that is not whole hours", () => {
    vi.setSystemTime("2024-01-15T07:30:00Z");
    expect(
      formatDTM(
        nowDTM({ precision: Precision.Minute, timeZone: "Asia/Kathmandu" })
      )
    ).toBe("202401151315+0545");
  });

  // St. John's, Newfoundland, is UTC-3:30 in winter: 07:30 UTC is 04:00 there.
  it("gives an offset west of UTC that is not whole hours", () => {
    vi.setSystemTime("2024-01-15T07:30:00Z");
    expect(
      formatDTM(
        nowDTM({ precision: Precision.Minute, timeZone: "America/St_Johns" })
      )
    ).toBe("202401150400-0330");
  });

  // IANA's `Etc/GMT` zones count the other way: `Etc/GMT+5` is 5 hours
  // behind UTC, so 07:30 UTC is 02:30 there, at `-0500`.
  it("gives the offset of an Etc/GMT zone, whose name has the opposite sign", () => {
    vi.setSystemTime("2024-01-15T07:30:00Z");
    expect(
      formatDTM(nowDTM({ precision: Precision.Minute, timeZone: "Etc/GMT+5" }))
    ).toBe("202401150230-0500");
  });

  // On 2024-03-31 at 01:00 UTC, London's clocks jump from 01:00 GMT to 02:00
  // BST. A different zone and date from the host's tests, so the named zone
  // is shown to follow its own rules.
  it("gives the offset at each side of the change to daylight saving time", () => {
    vi.setSystemTime("2024-03-31T00:59:59Z");
    expect(
      formatDTM(
        nowDTM({ precision: Precision.Second, timeZone: "Europe/London" })
      )
    ).toBe("20240331005959+0000");
    vi.setSystemTime("2024-03-31T01:00:00Z");
    expect(
      formatDTM(
        nowDTM({ precision: Precision.Second, timeZone: "Europe/London" })
      )
    ).toBe("20240331020000+0100");
  });

  // On 2024-10-27 at 01:00 UTC, London's clocks fall back from 02:00 BST to
  // 01:00 GMT: 01:59:59+0100 is followed by 01:00:00+0000.
  it("gives the offset at each side of the change back to standard time", () => {
    vi.setSystemTime("2024-10-27T00:59:59Z");
    expect(
      formatDTM(
        nowDTM({ precision: Precision.Second, timeZone: "Europe/London" })
      )
    ).toBe("20241027015959+0100");
    vi.setSystemTime("2024-10-27T01:00:00Z");
    expect(
      formatDTM(
        nowDTM({ precision: Precision.Second, timeZone: "Europe/London" })
      )
    ).toBe("20241027010000+0000");
  });

  // 05:00 UTC is midnight in New York. A 24-hour clock writes it `00`; a
  // formatter on a 12-hour clock would give 12.
  it("writes midnight as hour 00", () => {
    vi.setSystemTime("2024-01-15T05:00:00Z");
    expect(
      formatDTM(
        nowDTM({ precision: Precision.Hour, timeZone: "America/New_York" })
      )
    ).toBe("2024011500-0500");
  });

  // Time zone names are not case-sensitive: `utc` is `UTC`.
  it("writes -0000 for UTC in any case", () => {
    vi.setSystemTime("2024-01-15T07:30:00Z");
    expect(
      formatDTM(nowDTM({ precision: Precision.Minute, timeZone: "utc" }))
    ).toBe("202401150730-0000");
  });

  it("reads the fields at a fixed offset from UTC", () => {
    vi.setSystemTime("2024-07-15T07:30:00Z");
    expect(
      formatDTM(nowDTM({ precision: Precision.Minute, timeZone: "-05:00" }))
    ).toBe("202407150230-0500");
  });

  // One call after another, each reads the clock in its own zone.
  it("reads each call in the zone it names", () => {
    vi.setSystemTime("2024-01-15T07:30:00Z");
    const options = { offset: false, precision: Precision.Minute };
    expect(formatDTM(nowDTM({ ...options, timeZone: "Asia/Kathmandu" }))).toBe(
      "202401151315"
    );
    expect(formatDTM(nowDTM(options))).toBe("202401150230");
    expect(formatDTM(nowDTM({ ...options, timeZone: "UTC" }))).toBe(
      "202401150730"
    );
  });

  // Monrovia kept local mean time, UTC-0:44:30, until 1972: an offset with
  // seconds, which `+/-HHMM` cannot hold. Its fields alone can be written.
  it("throws a TimestampOffsetError for an offset with seconds", () => {
    vi.setSystemTime("1970-01-01T00:00:00Z");
    const timeZone = "Africa/Monrovia";
    expect(() => nowDTM({ timeZone })).toThrow(TimestampOffsetError);
    expect(() => nowDTM({ timeZone })).toThrow(
      expect.objectContaining({ offset: "GMT-00:44:30" })
    );
    expect(formatDTM(nowDTM({ offset: false, timeZone }))).toBe(
      "19691231231530.000"
    );
  });

  it("throws a RangeError for a name that is not a time zone", () => {
    expect(() => nowDTM({ timeZone: "Mars/Olympus_Mons" })).toThrow(RangeError);
  });
});

// Intl reads the host's zone when it is given none, so the host is moved to
// UTC by giving every formatter that zone by default. A call in another zone
// comes first, so the formatter for the host's zone is built again.
describe("nowDTM on a host whose time zone is UTC", () => {
  // Another call in a named zone replaces the formatter built for the UTC
  // host, so the tests after this one read New York again.
  afterEach(() => {
    nowDTM({ timeZone: "UTC" });
  });

  it("writes offset zero as +0000", () => {
    const HostDateTimeFormat = Intl.DateTimeFormat;
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      function utcHostDateTimeFormat(locale, options) {
        return new HostDateTimeFormat(locale, {
          ...options,
          timeZone: options?.timeZone ?? "UTC",
        });
      }
    );
    nowDTM({ timeZone: "Asia/Kathmandu" });

    vi.setSystemTime("2024-01-15T07:30:00Z");
    expect(formatDTM(nowDTM({ precision: Precision.Minute }))).toBe(
      "202401150730+0000"
    );
  });
});

// Every case reads 2024-01-15 02:30:45.123 EST (07:30:45.123 UTC). A precision
// keeps the fields from the year down to it; only `fraction` keeps the
// milliseconds. A year, month, or day is a calendar date and has no offset; an
// hour or finer is a moment and keeps it.
describe("nowDTM precision", () => {
  beforeEach(() => {
    vi.setSystemTime("2024-01-15T07:30:45.123Z");
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
      offset: "-0500",
      precision: "second",
      second: 45,
      year: 2024,
    });
  });

  it("keeps the milliseconds at fraction, as with no precision", () => {
    expect(formatDTM(nowDTM({ precision: Precision.Fraction }))).toBe(
      "20240115023045.123-0500"
    );
  });
});

// `offset` overrides the default either way and keeps the fields as they are.
describe("nowDTM with the offset set", () => {
  it("leaves the offset out", () => {
    vi.setSystemTime("2024-01-15T07:30:45.123Z");
    expect(
      formatDTM(nowDTM({ offset: false, precision: Precision.Minute }))
    ).toBe("202401150230");
  });

  it("leaves the offset out in a named zone", () => {
    vi.setSystemTime("2024-01-15T07:30:45.123Z");
    expect(formatDTM(nowDTM({ offset: false, timeZone: "UTC" }))).toBe(
      "20240115073045.123"
    );
  });

  // At 03:00 UTC on 1 February it is still 31 January in New York: the offset
  // says whose calendar the date was read in.
  it("gives a date its offset with `offset: true`", () => {
    vi.setSystemTime("2024-02-01T03:00:00Z");
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

// `YYYYMMDDHHMMSS.SSS+/-ZZZZ`, the text `nowDTM()` gives with no precision.
const FULL_DTM =
  /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d{3})([+-]\d{2})(\d{2})$/;

/**
 * The instant `text` names, read by `Date.parse` as ISO 8601, or `NaN` when it
 * is not `YYYYMMDDHHMMSS.SSS+/-ZZZZ`. `20240115023000.123-0500` is
 * `2024-01-15T02:30:00.123-05:00`.
 */
function instantIn(text: string): number {
  const match = FULL_DTM.exec(text);
  if (match === null) {
    return Number.NaN;
  }
  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
    fraction,
    zoneHours,
    zoneMinutes,
  ] = match;
  return Date.parse(
    `${year}-${month}-${day}T${hour}:${minute}:${second}${fraction}${zoneHours}:${zoneMinutes}`
  );
}

// The value, written as HL7v2 text and read back, names the moment it was
// taken, in any zone and on either side of a daylight saving time change.
describe("nowDTM names the current instant", () => {
  // Mutant: the formatter leaves out `hourCycle: "h23"`, so it reads the hour
  // on a 12-hour clock. Fails on `2000-01-01T00:00:00.000Z` in `UTC`.
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

  // Mutant: `nowDTM` keeps the `:` of `GMT-05:00`, so the offset is written
  // `-05:00`. Fails on `2000-01-01T00:00:00.000Z`.
  it("in the host's zone", () => {
    fc.assert(
      fc.property(instants, (instant) => {
        vi.setSystemTime(instant);
        expect(instantIn(formatDTM(nowDTM()))).toBe(instant.getTime());
      })
    );
  });
});
