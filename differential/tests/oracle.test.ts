import { startOracle } from "../src/oracle";

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
