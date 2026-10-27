/**
 * How much of a date and time an HL7v2 value gives: the last field it gives,
 * from the year down to the fraction of a second.
 *
 * | Precision  | DTM written as              | Example             |
 * | ---------- | --------------------------- | ------------------- |
 * | `year`     | `YYYY`                      | `2026`              |
 * | `month`    | `YYYYMM`                    | `202603`            |
 * | `day`      | `YYYYMMDD`                  | `20260307`          |
 * | `hour`     | `YYYYMMDDHH`                | `2026030714`        |
 * | `minute`   | `YYYYMMDDHHMM`              | `202603071430`      |
 * | `second`   | `YYYYMMDDHHMMSS`            | `20260307143045`    |
 * | `fraction` | `YYYYMMDDHHMMSS.S[S[S[S]]]` | `20260307143045.12` |
 */
// oxlint-disable-next-line sort-keys
export const Precision = {
  Year: "year",
  Month: "month",
  Day: "day",
  Hour: "hour",
  Minute: "minute",
  Second: "second",
  Fraction: "fraction",
} as const;

export type Precision = (typeof Precision)[keyof typeof Precision];
