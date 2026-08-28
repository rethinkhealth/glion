import { describe, expect, it } from "vitest";

import { renderHuman, renderJson } from "./send-render";
import type {
  SendAcceptOutcome,
  SendInvalidOutcome,
  SendNakOutcome,
  SendTransportOutcome,
} from "./send-render";

const TARGET = { host: "127.0.0.1", port: 2575 } as const;
const REQUEST = {
  byteCount: 410,
  controlId: "MSG00001",
  segmentCount: 3,
} as const;

const accept: SendAcceptOutcome = {
  ackControlId: "MSG00001",
  code: "AA",
  durationMs: 12,
  kind: "accept",
  request: REQUEST,
  target: TARGET,
  text: "Message accepted",
};

const nak: SendNakOutcome = {
  ackControlId: "MSG00001",
  code: "AE",
  durationMs: 9,
  errorCode: "207",
  kind: "nak",
  request: REQUEST,
  severity: "E",
  target: TARGET,
  text: "unknown segment ZZZ",
};

const transport: SendTransportOutcome = {
  code: "CONNECT_FAILED",
  kind: "transport",
  message: "connection refused",
  target: TARGET,
};

const invalid: SendInvalidOutcome = {
  kind: "invalid",
  message: "Not an HL7v2 message: it must begin with an MSH segment.",
};

describe("renderHuman", () => {
  describe("accept", () => {
    it("renders the sent line, the ACK line, and the MSA-3 text", () => {
      const out = renderHuman(accept);
      const lines = out.split("\n");
      expect(lines[0]).toBe(
        "-> sent  127.0.0.1:2575  MSH-10 MSG00001  3 segs, 410 B"
      );
      expect(lines[1]).toBe("<- ACK   AA  MSA-2 MSG00001  12.00ms");
      expect(lines[2]).toBe('        "Message accepted"');
    });

    it("omits the MSA-3 line when there is no text", () => {
      const out = renderHuman({ ...accept, text: undefined });
      const lines = out.split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain("AA");
    });

    it("renders CA the same as AA", () => {
      const out = renderHuman({ ...accept, code: "CA", text: undefined });
      expect(out).toContain("<- ACK   CA");
    });

    it("singularizes the segment count", () => {
      const out = renderHuman({
        ...accept,
        request: { ...REQUEST, segmentCount: 1 },
      });
      expect(out.split("\n")[0]).toContain("1 seg, ");
    });
  });

  describe("nak", () => {
    it("renders the sent line, the NAK line, and the ERR-3/ERR-4/text detail", () => {
      const out = renderHuman(nak);
      const lines = out.split("\n");
      expect(lines[0]).toBe(
        "-> sent  127.0.0.1:2575  MSH-10 MSG00001  3 segs, 410 B"
      );
      expect(lines[1]).toBe("<- NAK   AE  MSA-2 MSG00001  9.000ms");
      expect(lines[2]).toBe(
        '        ERR-3 207  ERR-4 E  "unknown segment ZZZ"'
      );
    });

    it("omits the detail line entirely when no ERR fields or text exist", () => {
      const out = renderHuman({
        ...nak,
        errorCode: undefined,
        severity: undefined,
        text: undefined,
      });
      const lines = out.split("\n");
      expect(lines).toHaveLength(2);
    });

    it("includes only the present detail parts", () => {
      const out = renderHuman({
        ...nak,
        errorCode: undefined,
        severity: undefined,
      });
      expect(out.split("\n")[2]).toBe('        "unknown segment ZZZ"');
    });

    it("renders the AR / CE / CR codes", () => {
      for (const code of ["AR", "CE", "CR"] as const) {
        const out = renderHuman({ ...nak, code });
        expect(out).toContain(`<- NAK   ${code}`);
      }
    });
  });

  describe("transport", () => {
    it("renders a single diagnostic line with the target, code, and message", () => {
      const out = renderHuman(transport);
      expect(out).not.toContain("\n");
      expect(out).toContain("127.0.0.1:2575");
      expect(out).toContain("CONNECT_FAILED");
      expect(out).toContain("connection refused");
    });
  });

  describe("invalid", () => {
    it("renders a single diagnostic line with the authored message", () => {
      const out = renderHuman(invalid);
      expect(out).not.toContain("\n");
      expect(out).toContain("begin with an MSH segment");
    });
  });
});

describe("renderJson", () => {
  it("emits exactly one line (no embedded newline)", () => {
    for (const outcome of [accept, nak, transport, invalid]) {
      expect(renderJson(outcome)).not.toContain("\n");
    }
  });

  describe("accept", () => {
    it("carries the stable success key set", () => {
      const json = JSON.parse(renderJson(accept));
      expect(json).toEqual({
        code: "AA",
        controlId: "MSG00001",
        durationMs: 12,
        host: "127.0.0.1",
        ok: true,
        port: 2575,
        requestControlId: "MSG00001",
        text: "Message accepted",
      });
    });

    it("omits text when absent", () => {
      const json = JSON.parse(renderJson({ ...accept, text: undefined }));
      expect("text" in json).toBe(false);
      expect(json.ok).toBe(true);
    });
  });

  describe("nak", () => {
    it("carries ok:false, kind:nak, and the ERR fields", () => {
      const json = JSON.parse(renderJson(nak));
      expect(json).toEqual({
        code: "AE",
        controlId: "MSG00001",
        durationMs: 9,
        errorCode: "207",
        host: "127.0.0.1",
        kind: "nak",
        ok: false,
        port: 2575,
        requestControlId: "MSG00001",
        severity: "E",
        text: "unknown segment ZZZ",
      });
    });

    it("omits absent optional fields", () => {
      const json = JSON.parse(
        renderJson({
          ...nak,
          errorCode: undefined,
          severity: undefined,
          text: undefined,
        })
      );
      expect("errorCode" in json).toBe(false);
      expect("severity" in json).toBe(false);
      expect("text" in json).toBe(false);
    });
  });

  describe("transport", () => {
    it("carries ok:false, kind:transport, code, and message", () => {
      const json = JSON.parse(renderJson(transport));
      expect(json).toEqual({
        code: "CONNECT_FAILED",
        host: "127.0.0.1",
        kind: "transport",
        message: "connection refused",
        ok: false,
        port: 2575,
      });
    });

    it("includes requestControlId when a request was serialized", () => {
      const json = JSON.parse(renderJson({ ...transport, request: REQUEST }));
      expect(json.requestControlId).toBe("MSG00001");
    });
  });

  describe("invalid", () => {
    it("carries ok:false, kind:invalid, and the message with no target", () => {
      const json = JSON.parse(renderJson(invalid));
      expect(json).toEqual({
        kind: "invalid",
        message: "Not an HL7v2 message: it must begin with an MSH segment.",
        ok: false,
      });
    });

    it("includes host/port when a target was resolved before the failure", () => {
      const json = JSON.parse(renderJson({ ...invalid, target: TARGET }));
      expect(json.host).toBe("127.0.0.1");
      expect(json.port).toBe(2575);
    });
  });
});
