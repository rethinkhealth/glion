import { parseHL7v2 } from "@glion/hl7v2";
import { toHl7v2 } from "@glion/to-hl7v2";

import { isReply, toReply } from "../../src/server/reply";

const ACK =
  "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240101120000||ACK^A01^ACK|ACK001|P|2.5.1\rMSA|AA|MSG001";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("toReply", () => {
  it("writes the message with the serializer it is given, as UTF-8", () => {
    const reply = toReply(parseHL7v2.parse(ACK), (tree) =>
      toHl7v2(tree).toLowerCase()
    );

    expect(decode(reply.bytes)).toBe(ACK.toLowerCase());
  });

  it("takes its code from MSA-1", () => {
    const reply = toReply(
      parseHL7v2.parse(ACK.replace("MSA|AA", "MSA|CA")),
      toHl7v2
    );

    expect(reply.code).toBe("CA");
  });

  it("has no code when MSA-1 is not an acknowledgment code", () => {
    const reply = toReply(
      parseHL7v2.parse(ACK.replace("MSA|AA", "MSA|XX")),
      toHl7v2
    );

    expect(reply.code).toBeUndefined();
  });

  it("has no code when the message has no MSA", () => {
    const reply = toReply(parseHL7v2.parse(ACK.split("\r")[0] ?? ""), toHl7v2);

    expect(reply.code).toBeUndefined();
  });

  it("is immutable, and keeps its bytes when the tree changes after it", () => {
    const tree = parseHL7v2.parse(ACK);
    const reply = toReply(tree, toHl7v2);
    tree.children.pop();

    expect(Object.isFrozen(reply)).toBe(true);
    expect(decode(reply.bytes)).toBe(ACK);
  });
});

describe("isReply", () => {
  it("recognizes a Reply", () => {
    expect(isReply(toReply(parseHL7v2.parse(ACK), toHl7v2))).toBe(true);
  });

  it("does not take a tree, a look-alike object, a string, or null for a Reply", () => {
    expect(isReply(parseHL7v2.parse(ACK))).toBe(false);
    expect(isReply({ bytes: new TextEncoder().encode(ACK), code: "AA" })).toBe(
      false
    );
    expect(isReply(ACK)).toBe(false);
    expect(isReply(null)).toBe(false);
  });
});
