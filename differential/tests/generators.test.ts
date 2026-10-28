import fc from "fast-check";

import { arbSpecMessage } from "../src/generators";
import type { SpecMessage } from "../src/oracle";
import { startOracle } from "../src/oracle";

const oracle = startOracle();
afterAll(oracle.close);

// The generator stays inside the specification's domain: the specification
// itself confirms each message breaks no rule.
//
// Mutant: `data` keeps separators (drop its filter, add `|` to DATA). Fails on
// `{"delimiters":"|^~\\&","header":[],"segments":[{"fields":[[[["|"]]]],"id":"AAA"}]}`.
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
  const valuesOf = (message: SpecMessage) =>
    fieldsOf(message).flat(3 /* repetition, component, subcomponent */);

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
        valuesOf(m).some((value) => value.includes(m.delimiters[3] ?? ""))
      )
    ).toBe(true);
  });

  it("draws an escape sequence of §2.7 in data", () => {
    const sequences = (escape: string) =>
      [..."FSTRE"].map((letter) => `${escape}${letter}${escape}`);

    expect(
      sample.some((m) =>
        valuesOf(m).some((value) =>
          sequences(m.delimiters[3] ?? "").some((sequence) =>
            value.includes(sequence)
          )
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
