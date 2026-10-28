import { parseHL7v2 } from "../src";

describe(parseHL7v2, () => {
  it("parses MSH + PID and decodes escapes, then stringifies to JSON", async () => {
    const msg = [
      // MSH with delimiters and sender
      "MSH|^~\\&|SENDER|FAC|RCVR|FAC|20250101010101||ADT^A01|MSG00001|P|2.5\r",
      // PID with components, repetitions and escapes (\S\ for ^)
      "PID|1||12345^^^HOSP^MR||DOE\\S\\JOHN^A&J|19700101|M\r",
    ].join("");

    const file = await parseHL7v2.process(msg);

    expect(file).toMatchSnapshot({ cwd: expect.any(String) });
  });

  it("handles trailing delimiters and preserves empty structures appropriately", async () => {
    const msg = "PID|A^B&|C~|";
    const file = await parseHL7v2.process(msg);

    expect(file.value).toMatchSnapshot();
  });

  it("does not store delimiters on root.data", () => {
    const msg = [
      "MSH|^~\\&|SENDER|FAC|RCVR|FAC|20250101010101||ADT^A01|MSG00001|P|2.5\r",
      "PID|||PATID1234^5^M11^ADT1^MR^UNIVERSITY HOSPITAL~123_456_789^^^USSSA^SS||EVERYMAN^ADAM^A^III||19_610_615|M||C|1200 N ELM STREET^^GREENSBORO^NC^27_401-1020|GL|(919)379-1212|(919)271-3434||S||PATID12345001^2^M10^ADT1^AN^A|123_456_789|9-87_654^NC\r",
      "OBR|1|845439^GHH OE|1045813^GHH LAB|1554-5^GLUCOSE^LN|||200202150730|||||||||DOCT^KILDARE^JAMES^A|||||||200202150930||F|||^^^^^R\r",
    ].join("");

    const root = parseHL7v2.parse(msg);

    expect(root).toBeDefined();
    expect(root.data).toBeUndefined();
  });

  it("handles decoding escapes", async () => {
    const msg = "PID|1|Value\\F\\More\\S\\Stuff\\R\\Again\\T\\Sub\\E\\Escaped|";
    const file = await parseHL7v2.process(msg);

    expect(file.value).toMatchSnapshot();
  });

  it("parses multiple segments with MSH as the first segment", async () => {
    const msg = [
      // MSH
      "MSH|^~\\&|SENDER|FAC|RCVR|FAC|20250101010101||ADT^A01|MSG00001|P|2.5\r",
      // PID
      "PID|||PATID1234^5^M11^ADT1^MR^UNIVERSITY HOSPITAL~123_456_789^^^USSSA^SS||EVERYMAN^ADAM^A^III||19_610_615|M||C|1200 N ELM STREET^^GREENSBORO^NC^27_401-1020|GL|(919)379-1212|(919)271-3434||S||PATID12345001^2^M10^ADT1^AN^A|123_456_789|9-87_654^NC\r",
      // OBX
      "OBR|1|845439^GHH OE|1045813^GHH LAB|1554-5^GLUCOSE^LN|||200202150730|||||||||DOCT^KILDARE^JAMES^A|||||||200202150930||F|||^^^^^R\r",
    ].join("");

    const file = await parseHL7v2.process(msg);
    expect(file.value).toMatchSnapshot();
  });

  it("parses multiple segments without MSH as the first segment", async () => {
    const msg = [
      // PID
      "PID|||PATID1234^5^M11^ADT1^MR^UNIVERSITY HOSPITAL~123_456_789^^^USSSA^SS||EVERYMAN^ADAM^A^III||19_610_615|M||C|1200 N ELM STREET^^GREENSBORO^NC^27_401-1020|GL|(919)379-1212|(919)271-3434||S||PATID12345001^2^M10^ADT1^AN^A|123_456_789|9-87_654^NC\r",
      // OBX
      "OBR|1|845439^GHH OE|1045813^GHH LAB|1554-5^GLUCOSE^LN|||200202150730|||||||||DOCT^KILDARE^JAMES^A|||||||200202150930||F|||^^^^^R\r",
    ].join("");

    const file = await parseHL7v2.process(msg);

    expect(file.value).toMatchSnapshot();
    expect(file.result).toMatchSnapshot();
  });

  it("parses correctly similar messages with different carriage returns", async () => {
    const msgWithCr = [
      // PID
      "PID|||PATID1234^5^M11^ADT1^MR^UNIVERSITY HOSPITAL~123_456_789^^^USSSA^SS||EVERYMAN^ADAM^A^III||19_610_615|M||C|1200 N ELM STREET^^GREENSBORO^NC^27_401-1020|GL|(919)379-1212|(919)271-3434||S||PATID12345001^2^M10^ADT1^AN^A|123_456_789|9-87_654^NC\r",
      // OBX
      "OBR|1|845439^GHH OE|1045813^GHH LAB|1554-5^GLUCOSE^LN|||200202150730|||||||||DOCT^KILDARE^JAMES^A|||||||200202150930||F|||^^^^^R\r",
    ].join("");

    const msgWithLf = [
      // PID
      "PID|||PATID1234^5^M11^ADT1^MR^UNIVERSITY HOSPITAL~123_456_789^^^USSSA^SS||EVERYMAN^ADAM^A^III||19_610_615|M||C|1200 N ELM STREET^^GREENSBORO^NC^27_401-1020|GL|(919)379-1212|(919)271-3434||S||PATID12345001^2^M10^ADT1^AN^A|123_456_789|9-87_654^NC",
      // OBX
      "OBR|1|845439^GHH OE|1045813^GHH LAB|1554-5^GLUCOSE^LN|||200202150730|||||||||DOCT^KILDARE^JAMES^A|||||||200202150930||F|||^^^^^R",
    ].join("\n");

    const fileCr = await parseHL7v2.process(msgWithCr);
    const fileLf = await parseHL7v2.process(msgWithLf);

    expect(fileCr.result).toStrictEqual(fileLf.result);
  });

  it("reads a trailing field separator as an empty last field", async () => {
    const msgWithTrailingFieldSeparator = [
      // PID
      "PID|||PATID1234^5^M11^ADT1^MR^UNIVERSITY HOSPITAL~123_456_789^^^USSSA^SS||EVERYMAN^ADAM^A^III||19_610_615|M||C|1200 N ELM STREET^^GREENSBORO^NC^27_401-1020|GL|(919)379-1212|(919)271-3434||S||PATID12345001^2^M10^ADT1^AN^A|123_456_789|9-87_654^NC|\r",
      // OBX
      "OBR|1|845439^GHH OE|1045813^GHH LAB|1554-5^GLUCOSE^LN|||200202150730|||||||||DOCT^KILDARE^JAMES^A|||||||200202150930||F|||^^^^^R|\r",
    ].join("");

    const msgWithoutTrailingFieldSeparator = [
      // PID
      "PID|||PATID1234^5^M11^ADT1^MR^UNIVERSITY HOSPITAL~123_456_789^^^USSSA^SS||EVERYMAN^ADAM^A^III||19_610_615|M||C|1200 N ELM STREET^^GREENSBORO^NC^27_401-1020|GL|(919)379-1212|(919)271-3434||S||PATID12345001^2^M10^ADT1^AN^A|123_456_789|9-87_654^NC\r",
      // OBX
      "OBR|1|845439^GHH OE|1045813^GHH LAB|1554-5^GLUCOSE^LN|||200202150730|||||||||DOCT^KILDARE^JAMES^A|||||||200202150930||F|||^^^^^R\r",
    ].join("");

    const withTrailing = await parseHL7v2.process(
      msgWithTrailingFieldSeparator
    );
    const withoutTrailing = await parseHL7v2.process(
      msgWithoutTrailingFieldSeparator
    );
    const segments = withoutTrailing.result as { fields: unknown[] }[];

    expect(withTrailing.result).toStrictEqual(
      segments.map((segment) => ({
        ...segment,
        fields: [...segment.fields, ""],
      }))
    );
  });
});
