import fc from "fast-check";

import { arbSpecMessage } from "../src/generators";
import type { SpecMessage, SpecSubcomponent } from "../src/oracle";
import { startOracle } from "../src/oracle";

const oracle = startOracle();
afterAll(oracle.close);

// The generator stays inside the specification's domain: the specification
// itself confirms each message breaks no rule.
//
// Mutant: DATA holds the segment terminator (add `\r`). Fails on
// `{"delimiters":"|^~\\&","header":[],"segments":[{"fields":[[[["\r"]]]],"id":"AAA"}]}`.
it("draws only well-formed messages", async () => {
  await fc.assert(
    fc.asyncProperty(arbSpecMessage, async (message) => {
      const { failures } = await oracle.ask(message);
      expect(failures).toEqual([]);
    }),
    { numRuns: 200 }
  );
});

// What the generator reaches: each test names one kind of message the
// properties in `properties/` depend on, and checks that a fixed sample of the
// generator draws it at least once.
describe("arbSpecMessage", () => {
  const sample = fc.sample(arbSpecMessage, { numRuns: 1000, seed: 1 });

  const fieldsOf = (message: SpecMessage) => [
    ...message.header,
    ...message.segments.flatMap((segment) => segment.fields),
  ];
  const valuesOf = (message: SpecMessage): SpecSubcomponent[] =>
    fieldsOf(message)
      .flat(2 /* repetition, component */)
      .flat(/* subcomponent */);
  // The runs of data characters in a value, and its escape sequences.
  const runsOf = (message: SpecMessage) =>
    valuesOf(message).flatMap((value) =>
      typeof value === "string"
        ? [value]
        : value.filter((piece) => typeof piece === "string")
    );
  const sequencesOf = (message: SpecMessage) =>
    valuesOf(message).flatMap((value) =>
      typeof value === "string"
        ? []
        : value.flatMap((piece) =>
            typeof piece === "string" ? [] : [piece.sequence]
          )
    );

  it("draws the suggested delimiters", () => {
    expect(sample.some((m) => m.delimiters === "|^~\\&")).toBe(true);
  });

  it("draws other delimiters", () => {
    expect(sample.some((m) => m.delimiters !== "|^~\\&")).toBe(true);
  });

  it("draws five distinct delimiters every time", () => {
    for (const message of sample) {
      expect(new Set(message.delimiters).size).toBe(5);
    }
  });

  it("draws the escape character in data", () => {
    expect(
      sample.some((m) =>
        runsOf(m).some((run) => run.includes(m.delimiters[3] ?? ""))
      )
    ).toBe(true);
  });

  it.each([
    ["field separator", 0],
    ["component separator", 1],
    ["repetition separator", 2],
    ["subcomponent separator", 4],
  ])("draws the %s in data", (_, index) => {
    expect(
      sample.some((m) =>
        runsOf(m).some((run) => run.includes(m.delimiters[index] ?? ""))
      )
    ).toBe(true);
  });

  it("draws data that looks like a delimiter's escape sequence", () => {
    const sequences = (escape: string) =>
      [..."FSTRE"].map((letter) => `${escape}${letter}${escape}`);

    expect(
      sample.some((m) =>
        runsOf(m).some((run) =>
          sequences(m.delimiters[3] ?? "").some((sequence) =>
            run.includes(sequence)
          )
        )
      )
    ).toBe(true);
  });

  it("draws data that looks like a formatting command", () => {
    expect(
      sample.some((m) =>
        runsOf(m).some((run) => {
          const escape = m.delimiters[3] ?? "";
          return run.includes(`${escape}H${escape}`);
        })
      )
    ).toBe(true);
  });

  it.each([
    ["truncation character (§2.7.2)", "P"],
    ["character set (§2.7.3)", "C"],
    ["highlighting (§2.7.4)", "H"],
    ["hexadecimal (§2.7.6)", "X"],
    ["locally defined (§2.7.8)", "Z"],
    ["formatting command (§2.7.7)", "."],
  ])("draws a %s escape sequence", (_, code) => {
    expect(
      sample.some((m) =>
        sequencesOf(m).some((sequence) => sequence.startsWith(code))
      )
    ).toBe(true);
  });

  it("draws a value with data characters and an escape sequence", () => {
    expect(
      sample.some((m) =>
        valuesOf(m).some(
          (value) =>
            typeof value !== "string" &&
            value.some((piece) => typeof piece === "string") &&
            value.some((piece) => typeof piece !== "string")
        )
      )
    ).toBe(true);
  });

  it("draws an empty value", () => {
    expect(sample.some((m) => valuesOf(m).includes(""))).toBe(true);
  });

  it("draws a field with more than one repetition", () => {
    expect(
      sample.some((m) => fieldsOf(m).some((field) => field.length > 1))
    ).toBe(true);
  });

  it("draws a repetition with more than one component", () => {
    expect(
      sample.some((m) =>
        fieldsOf(m).some((field) => field.some((rep) => rep.length > 1))
      )
    ).toBe(true);
  });

  it("draws a component with more than one subcomponent", () => {
    expect(
      sample.some((m) =>
        fieldsOf(m).some((field) =>
          field.some((rep) => rep.some((component) => component.length > 1))
        )
      )
    ).toBe(true);
  });

  it("draws an MSH with no fields after MSH-2", () => {
    expect(sample.some((m) => m.header.length === 0)).toBe(true);
  });

  it("draws a message with no segments after MSH", () => {
    expect(sample.some((m) => m.segments.length === 0)).toBe(true);
  });

  it("draws a message with several segments after MSH", () => {
    expect(sample.some((m) => m.segments.length > 1)).toBe(true);
  });

  it("draws a segment with no fields", () => {
    expect(
      sample.some((m) => m.segments.some((s) => s.fields.length === 0))
    ).toBe(true);
  });
});
