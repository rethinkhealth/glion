import { AckCode } from "@glion/ack";
import type { Field } from "@glion/ast";
import { c, f, m, s } from "@glion/builder";
import { parseHL7v2 } from "@glion/hl7v2";
import { toHl7v2 } from "@glion/to-hl7v2";
import { select } from "@glion/util-query";
import { VFile } from "vfile";

import { acknowledge } from "../../src/server/acknowledge";

const ADT_A01 = m(
  s(
    "MSH",
    f("|"), // MSH-1: field separator
    f("^~\\&"), // MSH-2: encoding characters (component, repetition, escape, subcomponent)
    f("SendApp"), // MSH-3: sending application
    f("SendFac"), // MSH-4: sending facility
    f("RecvApp"), // MSH-5: receiving application
    f("RecvFac"), // MSH-6: receiving facility
    f("20240101120000"), // MSH-7: date/time of message
    f(), // MSH-8: security
    f(c("ADT"), c("A01"), c("ADT_A01")), // MSH-9: message type ^ trigger event ^ message structure
    f("MSG001"), // MSH-10: message control ID, which MSA-2 echoes
    f("P"), // MSH-11: processing ID
    f("2.5.1") // MSH-12: version ID
  ),
  // acknowledge() reads only the MSH; the PID makes the message whole.
  s(
    "PID",
    f("1"),
    f(),
    f(c("12345"), c(), c(), c("MRN")),
    f(),
    f(c("Doe"), c("John"))
  )
);

describe("acknowledge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 15, 2, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts with AA, swapping sender and receiver and echoing MSH-10 in MSA-2", () => {
    const origin = ADT_A01;

    expect(toHl7v2(acknowledge(origin, { id: "ACK001" }))).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000-0500||ACK^A01^ACK|ACK001|P|2.5.1\rMSA|AA|MSG001"
    );
  });

  it("writes the given code to MSA-1 and leaves MSA-3 out", () => {
    const origin = ADT_A01;

    expect(
      toHl7v2(
        acknowledge(origin, { code: AckCode.ApplicationError, id: "ACK001" })
      )
    ).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000-0500||ACK^A01^ACK|ACK001|P|2.5.1\rMSA|AE|MSG001"
    );
  });

  it("writes a commit code to MSA-1", () => {
    const origin = ADT_A01;

    expect(
      toHl7v2(acknowledge(origin, { code: AckCode.CommitAccept, id: "ACK001" }))
    ).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000-0500||ACK^A01^ACK|ACK001|P|2.5.1\rMSA|CA|MSG001"
    );
  });

  it("writes MSH-9 as ACK alone when the original message has no trigger event", () => {
    const origin = m(
      s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f("SendApp"),
        f("SendFac"),
        f("RecvApp"),
        f("RecvFac"),
        f("20240101120000"),
        f(),
        f("ADT"), // MSH-9: a message type with no trigger event
        f("MSG001"),
        f("P"),
        f("2.3") // MSH-12: v2.3, before MSH-9.3 exists
      )
    );

    expect(toHl7v2(acknowledge(origin, { id: "ACK001" }))).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000-0500||ACK|ACK001|P|2.3\rMSA|AA|MSG001"
    );
  });

  it("writes MSH-9 without MSH-9.3 before v2.3.1", () => {
    const origin = m(
      s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f("SendApp"),
        f("SendFac"),
        f("RecvApp"),
        f("RecvFac"),
        f("20240101120000"),
        f(),
        f(c("ADT"), c("A01")), // MSH-9: no message structure (MSH-9.3)
        f("MSG001"),
        f("P"),
        f("2.3") // MSH-12: v2.3, before MSH-9.3 exists
      )
    );

    expect(toHl7v2(acknowledge(origin, { id: "ACK001" })).split("\r")[0]).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000-0500||ACK^A01|ACK001|P|2.3"
    );
  });

  it("copies composite sender, receiver, and processing ID fields whole", () => {
    const origin = m(
      s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f(c("SendApp"), c("1.2.3"), c("ISO")), // MSH-3: an HD with its universal ID
        f(c(), c("2.16.840"), c("ISO")), // MSH-4: an HD with no namespace ID
        f("RecvApp"),
        f("RecvFac"),
        f("20240101120000"),
        f(),
        f(c("ADT"), c("A01")),
        f("MSG001"),
        f(c("P"), c("T")), // MSH-11: processing ID ^ processing mode
        f("2.5.1")
      )
    );

    expect(toHl7v2(acknowledge(origin, { id: "ACK001" })).split("\r")[0]).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp^1.2.3^ISO|^2.16.840^ISO|20240115023000-0500||ACK^A01^ACK|ACK001|P^T|2.5.1"
    );
  });

  it("copies the original fields' values, not the data plugins attached to them", () => {
    const origin = structuredClone(ADT_A01);
    const msh5 = select(origin, "MSH.5")?.node as Field;
    msh5.data = { lookup: () => "RecvApp" };

    const ack = acknowledge(origin, { id: "ACK001" });
    const msh3 = select(ack, "MSH.3")?.node as Field;

    expect(toHl7v2(ack).split("\r")[0]).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000-0500||ACK^A01^ACK|ACK001|P|2.5.1"
    );
    expect(msh3.data).toBeUndefined();
    expect(msh3.position).toBeUndefined();
  });

  it("echoes MSH-12.1 when MSH-12 carries the full version identifier", () => {
    const origin = m(
      s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f("SendApp"),
        f("SendFac"),
        f("RecvApp"),
        f("RecvFac"),
        f("20240101120000"),
        f(),
        f(c("ADT"), c("A01")),
        f("MSG001"),
        f("P"),
        f(c("2.5.1"), c("USA"), c("ISO")) // MSH-12: version ID ^ internationalization code ^ international version ID
      )
    );

    expect(toHl7v2(acknowledge(origin, { id: "ACK001" }))).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000-0500||ACK^A01^ACK|ACK001|P|2.5.1\rMSA|AA|MSG001"
    );
  });

  it("writes the given sending application and facility to MSH-3 and MSH-4", () => {
    const origin = ADT_A01;
    const ack = acknowledge(origin, {
      id: "ACK001",
      sending: { application: "Glion", facility: "Lab" },
    });

    expect(toHl7v2(ack).split("\r")[0]).toBe(
      "MSH|^~\\&|Glion|Lab|SendApp|SendFac|20240115023000-0500||ACK^A01^ACK|ACK001|P|2.5.1"
    );
  });

  it("writes MSH-7 to the second with the host's offset from UTC at that moment", () => {
    vi.setSystemTime(new Date(2024, 6, 15, 2, 30, 0, 456));
    const origin = ADT_A01;

    expect(toHl7v2(acknowledge(origin, { id: "ACK001" })).split("\r")[0]).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240715023000-0400||ACK^A01^ACK|ACK001|P|2.5.1"
    );
  });

  it("writes MSH-7 in the given time zone, with that zone's offset from UTC", () => {
    const origin = ADT_A01;
    const ack = acknowledge(origin, {
      id: "ACK001",
      timeZone: "Asia/Kathmandu",
    });

    expect(toHl7v2(ack).split("\r")[0]).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115131500+0545||ACK^A01^ACK|ACK001|P|2.5.1"
    );
  });

  it("writes MSH-7 in UTC with the offset -0000 when the time zone is UTC", () => {
    const origin = ADT_A01;
    const ack = acknowledge(origin, { id: "ACK001", timeZone: "UTC" });

    expect(toHl7v2(ack).split("\r")[0]).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115073000-0000||ACK^A01^ACK|ACK001|P|2.5.1"
    );
  });

  it("throws a RangeError when the time zone is not an IANA time zone name", () => {
    const origin = ADT_A01;

    expect(() =>
      acknowledge(origin, { timeZone: "Mars/Olympus_Mons" })
    ).toThrow(RangeError);
  });

  it("writes MSH-1 and MSH-2 with the default delimiters, whatever the original message declares", () => {
    const origin = m(
      s(
        "MSH",
        f("#"), // MSH-1: `#` as the field separator
        f("$~\\&"), // MSH-2: `$` as the component separator
        f("SendApp"),
        f("SendFac"),
        f("RecvApp"),
        f("RecvFac"),
        f("20240101120000"),
        f(),
        f(c("ADT"), c("A01")),
        f("MSG001"),
        f("P"),
        f("2.5.1")
      )
    );

    expect(toHl7v2(acknowledge(origin, { id: "ACK001" }))).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000-0500||ACK^A01^ACK|ACK001|P|2.5.1\rMSA|AA|MSG001"
    );
  });

  it("writes MSH-1 and MSH-2 with the given delimiters, and the acknowledgment with them", () => {
    const origin = ADT_A01;
    const ack = acknowledge(origin, {
      delimiters: { component: "$", field: "#" },
      id: "ACK001",
    });

    expect(toHl7v2(ack)).toBe(
      "MSH#$~\\&#RecvApp#RecvFac#SendApp#SendFac#20240115023000-0500##ACK$A01$ACK#ACK001#P#2.5.1\rMSA#AA#MSG001"
    );
  });

  it("writes the given processing ID to MSH-11", () => {
    const origin = ADT_A01;
    const ack = acknowledge(origin, { id: "ACK001", processingId: "T" });

    expect(toHl7v2(ack).split("\r")[0]).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000-0500||ACK^A01^ACK|ACK001|T|2.5.1"
    );
  });

  it("writes P to MSH-11 when the original message has no processing ID", () => {
    const origin = m(
      s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f("SendApp"),
        f("SendFac"),
        f("RecvApp"),
        f("RecvFac"),
        f("20240101120000"),
        f(),
        f(c("ADT"), c("A01")),
        f("MSG001"),
        f(), // MSH-11: no processing ID
        f("2.5.1")
      )
    );

    expect(toHl7v2(acknowledge(origin, { id: "ACK001" })).split("\r")[0]).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000-0500||ACK^A01^ACK|ACK001|P|2.5.1"
    );
  });

  it("gives every acknowledgment its own 20-character MSH-10 when no id is given", () => {
    const origin = ADT_A01;
    const first = toHl7v2(acknowledge(origin)).split("\r")[0]?.split("|")[9];
    const second = toHl7v2(acknowledge(origin)).split("\r")[0]?.split("|")[9];

    expect(first).toHaveLength(20);
    expect(second).toHaveLength(20);
    expect(first).not.toBe(second);
  });

  it("writes a delimiter in an original value as its escape sequence", () => {
    const origin = m(
      s(
        "MSH",
        f("|"),
        f("^~\\&"),
        f("SendApp"),
        f("Smith&Jones"), // MSH-4: holds the subcomponent separator `&`
        f("RecvApp"),
        f("RecvFac"),
        f("20240101120000"),
        f(),
        f(c("ADT"), c("A01")),
        f("MSG001"),
        f("P"),
        f("2.5.1")
      )
    );

    expect(toHl7v2(acknowledge(origin, { id: "ACK001" })).split("\r")[0]).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|Smith\\T\\Jones|20240115023000-0500||ACK^A01^ACK|ACK001|P|2.5.1"
    );
  });

  // The subject here is a parsed tree, before and after the pipeline runs, so
  // the origin is parsed.
  it("writes escaped original values back escaped once, whether or not the tree was run", async () => {
    const message =
      "MSH|^~\\&|SendApp|Smith\\T\\Jones|RecvApp|RecvFac|20240101120000||ADT^A01|MSG001|P|2.5.1";
    const origin = parseHL7v2.parse(message);
    const before = toHl7v2(acknowledge(origin, { id: "ACK001" }));
    await parseHL7v2.run(origin, new VFile(message));
    const after = toHl7v2(acknowledge(origin, { id: "ACK001" }));

    expect(before).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|Smith\\T\\Jones|20240115023000-0500||ACK^A01^ACK|ACK001|P|2.5.1\rMSA|AA|MSG001"
    );
    expect(after).toBe(before);
  });

  it("passes the recommended lint rules for a v2.5.1 message", async () => {
    const origin = ADT_A01;
    const file = await parseHL7v2.process(toHl7v2(acknowledge(origin)));

    expect(file.messages.filter(({ fatal }) => fatal)).toEqual([]);
  });
});
