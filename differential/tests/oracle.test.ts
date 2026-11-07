import { startOracle, toSpecSubcomponent } from "../src/oracle";

const oracle = startOracle();
afterAll(oracle.close);

describe("startOracle", () => {
  it("answers a well-formed message with its text and no failures", async () => {
    expect(
      await oracle.ask({
        delimiters: "|^~\\&",
        header: [],
        segments: [{ fields: [[[["1"]]], [[["Smith"], ["John"]]]], id: "PID" }],
      })
    ).toEqual({ failures: [], text: "MSH|^~\\&\rPID|1|Smith^John\r" });
  });

  it("writes a delimiter in data as its escape sequence", async () => {
    expect(
      await oracle.ask({
        delimiters: "|^~\\&",
        header: [],
        segments: [{ fields: [[[["Smith&Jones|\\"]]]], id: "PID" }],
      })
    ).toEqual({
      failures: [],
      text: "MSH|^~\\&\rPID|Smith\\T\\Jones\\F\\\\E\\\r",
    });
  });

  it("writes an escape sequence between two escape characters", async () => {
    expect(
      await oracle.ask({
        delimiters: "|^~\\&",
        header: [],
        segments: [
          {
            fields: [
              [[[[{ sequence: "H" }, "240*", { sequence: "N" }], "\\H\\"]]],
            ],
            id: "OBX",
          },
        ],
      })
    ).toEqual({
      failures: [],
      text: "MSH|^~\\&\rOBX|\\H\\240*\\N\\&\\E\\H\\E\\\r",
    });
  });

  it("names the escape sequence rules a message breaks", async () => {
    expect(
      await oracle.ask({
        delimiters: "|^~\\&",
        header: [],
        segments: [
          {
            fields: [[[[[{ sequence: "Q" }], [{ sequence: "Za|b" }]]]]],
            id: "OBX",
          },
        ],
      })
    ).toEqual({
      failures: [
        "well_formed_escape_sequence_defined",
        "well_formed_escape_sequence_no_delimiter",
      ],
      text: "MSH|^~\\&\rOBX|\\Q\\&\\Za|b\\\r",
    });
  });

  it("names the rule a message breaks, and still writes its text", async () => {
    expect(
      await oracle.ask({
        delimiters: "|^~\\&",
        header: [],
        segments: [{ fields: [[[["a\rb"]]]], id: "PID" }],
      })
    ).toEqual({
      failures: ["well_formed_subcomponent_no_terminator"],
      text: "MSH|^~\\&\rPID|a\rb\r",
    });
  });

  it("rejects a message with four delimiters, and answers the next one", async () => {
    await expect(
      oracle.ask({ delimiters: "|^~\\", header: [], segments: [] })
    ).rejects.toThrow(
      "The specification oracle refused the message: delimiters must be five characters: field, component, repetition, escape, subcomponent"
    );
    expect(
      await oracle.ask({ delimiters: "|^~\\&", header: [], segments: [] })
    ).toEqual({ failures: [], text: "MSH|^~\\&\r" });
  });
});

describe("toSpecSubcomponent", () => {
  it("joins runs side by side and drops empty ones", () => {
    expect(toSpecSubcomponent(["a", "b", { sequence: "H" }, ""])).toEqual([
      "ab",
      { sequence: "H" },
    ]);
  });

  it("writes a value of data characters as one string", () => {
    expect(toSpecSubcomponent(["a", "", "b"])).toBe("ab");
  });

  it("writes no pieces as the empty value", () => {
    expect(toSpecSubcomponent([])).toBe("");
  });
});
