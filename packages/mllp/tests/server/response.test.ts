import { parseHL7v2 } from "@glion/hl7v2";
import { toHl7v2 } from "@glion/to-hl7v2";

import { isResponse, toResponse } from "../../src/server/response";

const ACK =
  "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240101120000||ACK^A01^ACK|ACK001|P|2.5.1\rMSA|AA|MSG001";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("toResponse", () => {
  it("writes the message with the serializer it is given, as UTF-8", () => {
    const response = toResponse(parseHL7v2.parse(ACK), (tree) =>
      toHl7v2(tree).toLowerCase()
    );

    expect(decode(response.bytes)).toBe(ACK.toLowerCase());
  });

  it("takes its code from MSA-1", () => {
    const response = toResponse(
      parseHL7v2.parse(ACK.replace("MSA|AA", "MSA|CA")),
      toHl7v2
    );

    expect(response.code).toBe("CA");
  });

  it("has no code when MSA-1 is not an acknowledgment code", () => {
    const response = toResponse(
      parseHL7v2.parse(ACK.replace("MSA|AA", "MSA|XX")),
      toHl7v2
    );

    expect(response.code).toBeUndefined();
  });

  it("has no code when the message has no MSA", () => {
    const response = toResponse(
      parseHL7v2.parse(ACK.split("\r")[0] ?? ""),
      toHl7v2
    );

    expect(response.code).toBeUndefined();
  });

  it("keeps its bytes when the tree changes after it", () => {
    const tree = parseHL7v2.parse(ACK);
    const response = toResponse(tree, toHl7v2);
    tree.children.pop();

    expect(decode(response.bytes)).toBe(ACK);
  });
});

describe("isResponse", () => {
  it("recognizes an MllpResponse", () => {
    expect(isResponse(toResponse(parseHL7v2.parse(ACK), toHl7v2))).toBe(true);
  });

  it("does not take a tree, a look-alike object, a string, or null for an MllpResponse", () => {
    expect(isResponse(parseHL7v2.parse(ACK))).toBe(false);
    expect(
      isResponse({ bytes: new TextEncoder().encode(ACK), code: "AA" })
    ).toBe(false);
    expect(isResponse(ACK)).toBe(false);
    expect(isResponse(null)).toBe(false);
  });
});
