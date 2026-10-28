import { DEFAULT_DELIMITERS } from "@glion/utils";

import { HL7v2Tokenizer } from "../src/tokenizer";
import type { TokenizerOptions } from "../src/tokenizer";
import type { Token } from "../src/types";

function toks(
  input: string,
  options?: TokenizerOptions,
  delimiters = DEFAULT_DELIMITERS
): Token[] {
  const t = new HL7v2Tokenizer(options);
  t.reset({ delimiters, input });
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

describe("line breaks", () => {
  const lineBreaks = (input: string, delimiters = DEFAULT_DELIMITERS) =>
    toks(input, {}, delimiters)
      .filter((token) => token.type === "SEGMENT_END")
      .map(({ position }) => [position.start.offset, position.end.offset]);

  it("ends a segment at a carriage return, a line feed, or a carriage return and a line feed", () => {
    expect(lineBreaks("PID|1\rOBX|2\nNTE|3\r\nZZZ")).toStrictEqual([
      [5, 6],
      [11, 12],
      [17, 19],
    ]);
  });

  it("reads the text after each line break as a Segment ID", () => {
    const ids = toks("PID|1\nOB^X|2\r\nN~TE|3")
      .filter((token, index, all) => all[index - 1]?.type === "SEGMENT_END")
      .map((token) => token.value);

    expect(ids).toStrictEqual(["OB^X", "N~TE"]);
  });

  it("ends a value and a Segment ID at a line break", () => {
    const values = toks("PID|a\nOBX\r\nNTE|b\r\n")
      .filter((token) => token.type === "TEXT")
      .map((token) => token.value);

    expect(values).toStrictEqual(["PID", "a", "OBX", "NTE", "b"]);
  });

  it("counts each line break as one line", () => {
    const starts = toks("PID|1\r\nOBX|2\nNTE|3")
      .filter((token) => token.type === "TEXT" && token.value?.length === 3)
      .map(({ position }) => position.start);

    expect(starts).toStrictEqual([
      { column: 1, line: 1, offset: 0 },
      { column: 1, line: 2, offset: 7 },
      { column: 1, line: 3, offset: 13 },
    ]);
  });

  it("ends a segment at the segment delimiter the context gives", () => {
    const delimiters = { ...DEFAULT_DELIMITERS, segment: "$" };

    expect(lineBreaks("PID|1$OBX|2\r\nNTE", delimiters)).toStrictEqual([
      [5, 6],
      [11, 13],
    ]);
  });

  it("ends a Segment ID at a carriage return and a line feed when the segment delimiter is another character", () => {
    const delimiters = { ...DEFAULT_DELIMITERS, segment: "$" };

    expect(toks("PI\rD\r\nOBX|1", {}, delimiters).slice(0, 3)).toMatchObject([
      { type: "TEXT", value: "PI\rD" },
      { type: "SEGMENT_END" },
      { type: "TEXT", value: "OBX" },
    ]);
  });

  it("reads a carriage return without a line feed as text when the segment delimiter is another character", () => {
    const delimiters = { ...DEFAULT_DELIMITERS, segment: "$" };

    expect(toks("PID|a\rb", {}, delimiters)[2]).toMatchObject({
      type: "TEXT",
      value: "a\rb",
    });
  });

  it("ends MSH-2 at a carriage return before its fourth character", () => {
    const out = toks("MSH|^~\\\rPID|1");

    expect(out[4]).toMatchObject({ type: "TEXT", value: "^~\\" });
    expect(out[5]).toMatchObject({
      position: { end: { offset: 8 }, start: { offset: 7 } },
      type: "SEGMENT_END",
    });
    expect(out[6]).toMatchObject({
      position: { start: { column: 1, line: 2, offset: 8 } },
      type: "TEXT",
      value: "PID",
    });
  });

  it("ends MSH-2 at a carriage return and a line feed before its fourth character", () => {
    const out = toks("MSH|^~\\\r\nPID|1");

    expect(out[4]).toMatchObject({ type: "TEXT", value: "^~\\" });
    expect(out[5]).toMatchObject({
      position: { end: { offset: 9 }, start: { offset: 7 } },
      type: "SEGMENT_END",
    });
    expect(out[6]).toMatchObject({
      position: { start: { column: 1, line: 2, offset: 9 } },
      type: "TEXT",
      value: "PID",
    });
  });

  it("reads the first four characters of MSH-2 as one token, and a fifth, the truncation character, as the next", () => {
    expect(toks("MSH|^~\\&#|A").slice(4, 7)).toMatchObject([
      { type: "TEXT", value: "^~\\&" },
      { type: "TEXT", value: "#" },
      { type: "FIELD_DELIM" },
    ]);
  });

  it("ends MSH-2 at a field delimiter before its fourth character", () => {
    expect(toks("MSH|^~\\|APP").slice(4)).toMatchObject([
      { type: "TEXT", value: "^~\\" },
      { type: "FIELD_DELIM" },
      { type: "TEXT", value: "APP" },
    ]);
  });

  it("reads MSH followed by a line break as a Segment ID with no fields", () => {
    expect(
      toks("MSH\rPID|1").map(({ type, value }) => [type, value])
    ).toStrictEqual([
      ["TEXT", "MSH"],
      ["SEGMENT_END", undefined],
      ["TEXT", "PID"],
      ["FIELD_DELIM", undefined],
      ["TEXT", "1"],
    ]);
  });
});

describe("byte order mark", () => {
  it("starts the message after a byte order mark", () => {
    const out = toks("\uFEFFMSH|^~\\&|A");

    expect(out[0]).toMatchObject({
      position: {
        end: { column: 5, line: 1, offset: 4 },
        start: { column: 2, line: 1, offset: 1 },
      },
      type: "TEXT",
      value: "MSH",
    });
    expect(out[4]).toMatchObject({ type: "TEXT", value: "^~\\&" });
    expect(out[6]).toMatchObject({ type: "TEXT", value: "A" });
  });

  it("reads the first line after a byte order mark as a Segment ID", () => {
    expect(toks("\uFEFFP^D|1")[0]).toMatchObject({
      type: "TEXT",
      value: "P^D",
    });
  });

  it("reads a byte order mark after the start of the message as text", () => {
    expect(toks("PID|\uFEFF")[2]).toMatchObject({
      type: "TEXT",
      value: "\uFEFF",
    });
  });
});
