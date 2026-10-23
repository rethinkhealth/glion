import { AckCode } from "@glion/ack";
import { parseHL7v2 } from "@glion/hl7v2";
import { toHl7v2 } from "@glion/to-hl7v2";
import { VFile } from "vfile";

import { acknowledge } from "../../src/server/acknowledge";

const ADT_A01 = [
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1",
  "PID|1||12345^^^MRN||Doe^John",
].join("\r");

describe("acknowledge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 15, 2, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts with AA, swapping sender and receiver and echoing MSH-10 in MSA-2", () => {
    const origin = parseHL7v2.parse(ADT_A01);

    expect(toHl7v2(acknowledge(origin, { id: "ACK001" }))).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000||ACK^A01^ACK|ACK001|P|2.5.1\rMSA|AA|MSG001"
    );
  });

  it("writes the given code to MSA-1 and the given text to MSA-3", () => {
    const origin = parseHL7v2.parse(ADT_A01);

    expect(
      toHl7v2(
        acknowledge(origin, {
          code: AckCode.ApplicationError,
          id: "ACK001",
          text: "Patient not on file",
        })
      )
    ).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000||ACK^A01^ACK|ACK001|P|2.5.1\rMSA|AE|MSG001|Patient not on file"
    );
  });

  it("writes a commit code to MSA-1", () => {
    const origin = parseHL7v2.parse(ADT_A01);

    expect(
      toHl7v2(acknowledge(origin, { code: AckCode.CommitAccept, id: "ACK001" }))
    ).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000||ACK^A01^ACK|ACK001|P|2.5.1\rMSA|CA|MSG001"
    );
  });

  it("escapes delimiters in MSA-3 text", () => {
    const origin = parseHL7v2.parse(ADT_A01);
    const ack = acknowledge(origin, {
      code: AckCode.ApplicationReject,
      id: "ACK001",
      text: "Field 3|4 is empty",
    });

    expect(toHl7v2(ack).split("\r")[1]).toBe(
      "MSA|AR|MSG001|Field 3\\F\\4 is empty"
    );
  });

  it("writes MSH-9 as ACK alone when the original message has no trigger event", () => {
    const origin = parseHL7v2.parse(
      "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT|MSG001|P|2.3"
    );

    expect(toHl7v2(acknowledge(origin, { id: "ACK001" }))).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000||ACK|ACK001|P|2.3\rMSA|AA|MSG001"
    );
  });

  it("writes MSH-9 without MSH-9.3 before v2.3.1", () => {
    const origin = parseHL7v2.parse(
      "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01|MSG001|P|2.3"
    );

    expect(toHl7v2(acknowledge(origin, { id: "ACK001" })).split("\r")[0]).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000||ACK^A01|ACK001|P|2.3"
    );
  });

  it("copies composite sender, receiver, and processing ID fields whole", () => {
    const origin = parseHL7v2.parse(
      "MSH|^~\\&|SendApp^1.2.3^ISO|^2.16.840^ISO|RecvApp|RecvFac|20240101120000||ADT^A01|MSG001|P^T|2.5.1"
    );

    expect(toHl7v2(acknowledge(origin, { id: "ACK001" })).split("\r")[0]).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp^1.2.3^ISO|^2.16.840^ISO|20240115023000||ACK^A01^ACK|ACK001|P^T|2.5.1"
    );
  });

  it("echoes MSH-12.1 when MSH-12 carries the full version identifier", () => {
    const origin = parseHL7v2.parse(
      "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01|MSG001|P|2.5.1^USA^ISO"
    );

    expect(toHl7v2(acknowledge(origin, { id: "ACK001" }))).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000||ACK^A01^ACK|ACK001|P|2.5.1\rMSA|AA|MSG001"
    );
  });

  it("writes the given sending application and facility to MSH-3 and MSH-4", () => {
    const origin = parseHL7v2.parse(ADT_A01);
    const ack = acknowledge(origin, {
      id: "ACK001",
      sending: { application: "Glion", facility: "Lab" },
    });

    expect(toHl7v2(ack).split("\r")[0]).toBe(
      "MSH|^~\\&|Glion|Lab|SendApp|SendFac|20240115023000||ACK^A01^ACK|ACK001|P|2.5.1"
    );
  });

  it("writes the given processing ID to MSH-11", () => {
    const origin = parseHL7v2.parse(ADT_A01);
    const ack = acknowledge(origin, { id: "ACK001", processingId: "T" });

    expect(toHl7v2(ack).split("\r")[0]).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000||ACK^A01^ACK|ACK001|T|2.5.1"
    );
  });

  it("writes P to MSH-11 when the original message has no processing ID", () => {
    const origin = parseHL7v2.parse(
      "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01|MSG001||2.5.1"
    );

    expect(toHl7v2(acknowledge(origin, { id: "ACK001" })).split("\r")[0]).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000||ACK^A01^ACK|ACK001|P|2.5.1"
    );
  });

  it("gives every acknowledgment its own 20-character MSH-10 when no id is given", () => {
    const origin = parseHL7v2.parse(ADT_A01);
    const first = toHl7v2(acknowledge(origin)).split("\r")[0]?.split("|")[9];
    const second = toHl7v2(acknowledge(origin)).split("\r")[0]?.split("|")[9];

    expect(first).toHaveLength(20);
    expect(second).toHaveLength(20);
    expect(first).not.toBe(second);
  });

  it("writes escaped original values back escaped once, whether or not the tree was run", async () => {
    const message =
      "MSH|^~\\&|SendApp|Smith\\T\\Jones|RecvApp|RecvFac|20240101120000||ADT^A01|MSG001|P|2.5.1";
    const origin = parseHL7v2.parse(message);
    const before = toHl7v2(acknowledge(origin, { id: "ACK001" }));
    await parseHL7v2.run(origin, new VFile(message));
    const after = toHl7v2(acknowledge(origin, { id: "ACK001" }));

    expect(before).toBe(
      "MSH|^~\\&|RecvApp|RecvFac|SendApp|Smith\\T\\Jones|20240115023000||ACK^A01^ACK|ACK001|P|2.5.1\rMSA|AA|MSG001"
    );
    expect(after).toBe(before);
  });

  it("passes the recommended lint rules for a v2.5.1 message", async () => {
    const origin = parseHL7v2.parse(ADT_A01);
    const file = await parseHL7v2.process(toHl7v2(acknowledge(origin)));

    expect(file.messages.filter(({ fatal }) => fatal)).toEqual([]);
  });
});
