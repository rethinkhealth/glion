import { DEFAULT_DELIMITERS } from "@glion/utils";

import { HL7v2Tokenizer } from "../src/tokenizer";
import type { Token } from "../src/types";

function toks(input: string): Token[] {
  const t = new HL7v2Tokenizer();
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
