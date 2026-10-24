import { DEFAULT_DELIMITERS } from "@glion/utils";

import { HL7v2Tokenizer } from "../src/tokenizer";
import type { TokenizerOptions } from "../src/tokenizer";
import type { Token } from "../src/types";

function toks(input: string, options?: TokenizerOptions): Token[] {
  const t = new HL7v2Tokenizer(options);
  t.reset({ delimiters: DEFAULT_DELIMITERS, input });
  const out: Token[] = [];
  for (let k = t.next(); k; k = t.next()) {
    out.push(k);
  }
  return out;
}

describe("mSH bootstrap only at file start", () => {
  it("emits MSH as TEXT, then a synthetic FIELD_DELIM, then MSH.2 as TEXT for first segment only", () => {
    const out = toks("MSH|^~\\&|SENDER\rPID|1\rMSH|^~\\&|AGAIN"); // later MSH should NOT be bootstrapped

    expect(out[0]).toMatchObject({ type: "TEXT", value: "MSH" });
    expect(out[1]).toMatchObject({ type: "FIELD_DELIM" });
    expect(out[2]).toMatchObject({ type: "TEXT", value: "|" });
    expect(out[3]).toMatchObject({ type: "FIELD_DELIM" });
    expect(out[4]).toMatchObject({ type: "TEXT", value: "^~\\&" });
    // ensure later MSH is not bootstrapped (the '|' appears as a delimiter, not bootstrap emission)
    const later = out.findIndex(
      (t) => t.type === "TEXT" && t.value === "AGAIN"
    );
    expect(later).toBeGreaterThan(0);

    expect(out).toMatchSnapshot();
  });

  it("does not bootstrap when file does not start with MSH", () => {
    const out = toks("PID|1\rMSH|^~\\&|SENDER");
    // No special tokens up front—just TEXT('PID') then delimiters
    expect(out[0]).toMatchObject({ type: "TEXT", value: "PID" });
  });
});

describe("segment ids", () => {
  it("emits the text before a line's first field delimiter as one TEXT token", () => {
    const out = toks("PID|1\r^A~B&C|D");

    expect(out.slice(4)).toMatchObject([
      { type: "TEXT", value: "^A~B&C" },
      { type: "FIELD_DELIM" },
      { type: "TEXT", value: "D" },
    ]);
  });

  it("emits a line with no field delimiter as one TEXT token", () => {
    expect(toks("^A")).toMatchObject([{ type: "TEXT", value: "^A" }]);
  });

  it("does not decode escape sequences in a Segment ID", () => {
    expect(toks("Z\\R\\Z|B")[0]).toMatchObject({
      type: "TEXT",
      value: "Z\\R\\Z",
    });
  });
});

describe("escape sequences", () => {
  it("decodes escape sequences in a TEXT token", () => {
    const out = toks("PID|a\\F\\b\\S\\c");

    expect(out[2]).toMatchObject({ type: "TEXT", value: "a|b^c" });
  });

  it("keeps the source span of a decoded TEXT token", () => {
    const out = toks("PID|a\\F\\b");

    expect(out[2]?.position).toStrictEqual({
      end: { column: 10, line: 1, offset: 9 },
      start: { column: 5, line: 1, offset: 4 },
    });
  });

  it("counts lines by the source when .br decodes to the segment delimiter", () => {
    const out = toks("PID|a\\.br\\b\rOBX|1");

    expect(out[2]).toMatchObject({ type: "TEXT", value: "a\rb" });
    expect(out[4]?.position.start).toStrictEqual({
      column: 1,
      line: 2,
      offset: 12,
    });
  });

  it("does not decode the encoding characters MSH-2 declares", () => {
    const out = toks("MSH|^~\\&|SENDER");

    expect(out[4]).toMatchObject({ type: "TEXT", value: "^~\\&" });
  });

  it("keeps escape sequences when decodeEscapes is false", () => {
    const out = toks("PID|a\\F\\b", { decodeEscapes: false });

    expect(out[2]).toMatchObject({ type: "TEXT", value: "a\\F\\b" });
  });
});
