import { describe, expect, it } from "vitest";

import { parseAndGate, parseSendArgs } from "./send.js";

describe("parseSendArgs", () => {
  describe("message source", () => {
    it("defaults file to undefined (stdin) when no positional is given", () => {
      const result = parseSendArgs([]);
      expect(result).toEqual({
        args: {
          configPath: undefined,
          file: undefined,
          help: false,
          host: undefined,
          json: false,
          local: false,
          port: undefined,
          timeoutMs: undefined,
        },
        ok: true,
      });
    });

    it("captures a positional file path", () => {
      const result = parseSendArgs(["message.hl7"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.file).toBe("message.hl7");
      }
    });

    it('collapses the "-" stdin sentinel to undefined', () => {
      const result = parseSendArgs(["-"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.file).toBeUndefined();
      }
    });

    it('treats "-" as a positional, not an unknown flag, with other flags present', () => {
      const result = parseSendArgs(["--json", "-"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.file).toBeUndefined();
        expect(result.args.json).toBe(true);
      }
    });

    it("accepts a positional that is not the first token", () => {
      const result = parseSendArgs(["--host", "1.2.3.4", "message.hl7"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.file).toBe("message.hl7");
        expect(result.args.host).toBe("1.2.3.4");
      }
    });
  });

  describe("explicit target", () => {
    it("parses --host and --port", () => {
      const result = parseSendArgs(["--host", "127.0.0.1", "--port", "2575"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.host).toBe("127.0.0.1");
        expect(result.args.port).toBe(2575);
      }
    });

    it("parses --port as an integer, not a string", () => {
      const result = parseSendArgs(["--port", "2575"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.port).toBe(2575);
        expect(typeof result.args.port).toBe("number");
      }
    });
  });

  describe("--local", () => {
    it("sets local to true", () => {
      const result = parseSendArgs(["--local"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.local).toBe(true);
      }
    });

    it("allows --host to override an individual field alongside --local", () => {
      const result = parseSendArgs(["--local", "--host", "10.0.0.5"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.local).toBe(true);
        expect(result.args.host).toBe("10.0.0.5");
        expect(result.args.port).toBeUndefined();
      }
    });

    it("allows --port to override an individual field alongside --local", () => {
      const result = parseSendArgs(["--local", "--port", "9999"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.local).toBe(true);
        expect(result.args.port).toBe(9999);
        expect(result.args.host).toBeUndefined();
      }
    });

    it("allows both --host and --port overrides alongside --local", () => {
      const result = parseSendArgs([
        "--local",
        "--host",
        "10.0.0.5",
        "--port",
        "6000",
      ]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args).toMatchObject({
          host: "10.0.0.5",
          local: true,
          port: 6000,
        });
      }
    });
  });

  describe("--config", () => {
    it("captures a config path", () => {
      const result = parseSendArgs(["--config", "./glion.config.ts"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.configPath).toBe("./glion.config.ts");
      }
    });
  });

  describe("--timeout", () => {
    it("parses --timeout as an integer", () => {
      const result = parseSendArgs(["--timeout", "5000"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.timeoutMs).toBe(5000);
      }
    });

    it("leaves timeoutMs undefined when omitted", () => {
      const result = parseSendArgs([]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.timeoutMs).toBeUndefined();
      }
    });
  });

  describe("--json", () => {
    it("sets json to true", () => {
      const result = parseSendArgs(["--json"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.json).toBe(true);
      }
    });
  });

  describe("--help / -h", () => {
    it("sets help for --help", () => {
      const result = parseSendArgs(["--help"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.help).toBe(true);
      }
    });

    it("sets help for -h", () => {
      const result = parseSendArgs(["-h"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.help).toBe(true);
      }
    });
  });

  describe("combined happy path", () => {
    it("parses a full explicit-target invocation", () => {
      const result = parseSendArgs([
        "message.hl7",
        "--host",
        "192.168.1.10",
        "--port",
        "2575",
        "--timeout",
        "10000",
        "--json",
      ]);
      expect(result).toEqual({
        args: {
          configPath: undefined,
          file: "message.hl7",
          help: false,
          host: "192.168.1.10",
          json: true,
          local: false,
          port: 2575,
          timeoutMs: 10_000,
        },
        ok: true,
      });
    });
  });

  describe("error cases", () => {
    it("rejects --host without a value (end of argv)", () => {
      const result = parseSendArgs(["--host"]);
      expect(result).toEqual({ error: "--host requires a value", ok: false });
    });

    it("rejects --host followed by a flag", () => {
      const result = parseSendArgs(["--host", "--json"]);
      expect(result).toEqual({ error: "--host requires a value", ok: false });
    });

    it("rejects --port without a value", () => {
      const result = parseSendArgs(["--port"]);
      expect(result).toEqual({ error: "--port requires a value", ok: false });
    });

    it("rejects --port followed by a flag", () => {
      const result = parseSendArgs(["--port", "--local"]);
      expect(result).toEqual({ error: "--port requires a value", ok: false });
    });

    it("rejects a non-integer --port", () => {
      const result = parseSendArgs(["--port", "abc"]);
      expect(result).toEqual({
        error: "--port requires an integer value, got: abc",
        ok: false,
      });
    });

    it("rejects a fractional --port", () => {
      const result = parseSendArgs(["--port", "25.7"]);
      expect(result).toEqual({
        error: "--port requires an integer value, got: 25.7",
        ok: false,
      });
    });

    it("rejects --config without a value", () => {
      const result = parseSendArgs(["--config"]);
      expect(result).toEqual({
        error: "--config requires a path argument",
        ok: false,
      });
    });

    it("rejects --config followed by a flag", () => {
      const result = parseSendArgs(["--config", "--json"]);
      expect(result).toEqual({
        error: "--config requires a path argument",
        ok: false,
      });
    });

    it("rejects --timeout without a value", () => {
      const result = parseSendArgs(["--timeout"]);
      expect(result).toEqual({
        error: "--timeout requires a value",
        ok: false,
      });
    });

    it("rejects --timeout followed by a flag", () => {
      const result = parseSendArgs(["--timeout", "--json"]);
      expect(result).toEqual({
        error: "--timeout requires a value",
        ok: false,
      });
    });

    it("rejects a non-integer --timeout", () => {
      const result = parseSendArgs(["--timeout", "soon"]);
      expect(result).toEqual({
        error: "--timeout requires an integer value, got: soon",
        ok: false,
      });
    });

    it("rejects an unknown flag", () => {
      const result = parseSendArgs(["--raw"]);
      expect(result).toEqual({ error: "Unknown flag: --raw", ok: false });
    });

    it("rejects an unknown short flag", () => {
      const result = parseSendArgs(["-x"]);
      expect(result).toEqual({ error: "Unknown flag: -x", ok: false });
    });

    it("rejects more than one positional", () => {
      const result = parseSendArgs(["a.hl7", "b.hl7"]);
      expect(result).toEqual({
        error: "Unexpected argument: b.hl7",
        ok: false,
      });
    });

    it("rejects a second positional even when the first is the stdin sentinel", () => {
      const result = parseSendArgs(["-", "b.hl7"]);
      expect(result).toEqual({
        error: "Unexpected argument: b.hl7",
        ok: false,
      });
    });
  });
});

describe("parseAndGate", () => {
  const ADT_A01 = [
    "MSH|^~\\&|SENDER|FAC|RECEIVER|RFAC|20230101000000||ADT^A01^ADT_A01|MSG00001|P|2.5",
    "EVN|A01|20230101000000",
    "PID|1||12345^^^MRN||DOE^JOHN",
  ].join("\r");

  describe("accepts valid messages", () => {
    it("returns the parsed tree for a valid ADT message", () => {
      const result = parseAndGate(ADT_A01);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.tree.type).toBe("root");
        const first = result.tree.children[0];
        expect(first?.type).toBe("segment");
        if (first?.type === "segment") {
          expect(first.name).toBe("MSH");
        }
      }
    });

    it("accepts an LF-terminated message (not just CR)", () => {
      const result = parseAndGate(
        "MSH|^~\\&|S|F|R|RF|20230101||ADT^A01|MSG1|P|2.5\nPID|1"
      );
      expect(result.ok).toBe(true);
    });

    it("accepts a single-segment MSH-only message", () => {
      const result = parseAndGate("MSH|^~\\&|S|F|R|RF|20230101||ADT^A01|MSG1");
      expect(result.ok).toBe(true);
    });
  });

  describe("rejects non-HL7v2 input", () => {
    it("rejects an empty string", () => {
      const result = parseAndGate("");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("empty");
      }
    });

    it("rejects plain text", () => {
      const result = parseAndGate("hello world, this is not an HL7 message");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("begin with an MSH segment");
      }
    });

    it("rejects a JSON document", () => {
      const result = parseAndGate('{"resourceType":"Patient","id":"123"}');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("begin with an MSH segment");
      }
    });

    it("rejects a message whose leading segment is not MSH", () => {
      const result = parseAndGate("PID|1||12345^^^MRN||DOE^JOHN\rNK1|1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("begin with an MSH segment");
      }
    });

    it("rejects a lowercase msh header", () => {
      const result = parseAndGate(
        "msh|^~\\&|S|F|R|RF|20230101||ADT^A01|MSG1|P|2.5"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("uppercase segment ID");
      }
    });

    it("rejects leading whitespace before MSH (gate measures raw leading bytes)", () => {
      const result = parseAndGate(
        "\nMSH|^~\\&|S|F|R|RF|20230101||ADT^A01|MSG1"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("begin with an MSH segment");
      }
    });
  });

  describe("rejects a malformed MSH header", () => {
    it("rejects MSH with no field separator", () => {
      const result = parseAndGate("MSHxyz");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("field separator");
      }
    });

    it("rejects MSH with a separator but no encoding characters", () => {
      const result = parseAndGate("MSH|");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("encoding characters");
      }
    });

    it("rejects a whitespace character where the field separator belongs", () => {
      const result = parseAndGate("MSH ^~\\&|S|F");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("field separator");
      }
    });

    it("rejects a bare MSH with no fourth character", () => {
      const result = parseAndGate("MSH");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("field separator");
      }
    });
  });

  describe("accepts a non-default field separator", () => {
    it("accepts a header that uses '#' as the field separator", () => {
      const result = parseAndGate("MSH#^~\\&#S#F#R#RF#20230101##ADT^A01#MSG1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        const first = result.tree.children[0];
        expect(first?.type).toBe("segment");
        if (first?.type === "segment") {
          expect(first.name).toBe("MSH");
        }
      }
    });

    it("accepts a non-empty encoding run, deferring conformance to the peer (MSH|X|...)", () => {
      // The structural gate only requires a non-empty MSH-2 read from the raw
      // string between the field separator and the next one; whether "X" is a
      // valid encoding set is the receiving system's call (NAK), not the gate's.
      const result = parseAndGate("MSH|X|S|F");
      expect(result.ok).toBe(true);
    });
  });
});
