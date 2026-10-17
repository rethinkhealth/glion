import { describe, expect, it } from "vitest";

import { parseSendArgs } from "../../src/commands/send";

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
          port: undefined,
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

  describe("--config", () => {
    it("captures a config path", () => {
      const result = parseSendArgs(["--config", "./glion.config.ts"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.configPath).toBe("./glion.config.ts");
      }
    });

    it("falls back to the path given before the subcommand token", () => {
      const result = parseSendArgs([], "./before.config.ts");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.configPath).toBe("./before.config.ts");
      }
    });

    it("prefers its own path over the one before the token", () => {
      const result = parseSendArgs(
        ["--config", "./own.config.ts"],
        "./before.config.ts"
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.configPath).toBe("./own.config.ts");
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
        "--json",
      ]);
      expect(result).toEqual({
        args: {
          configPath: undefined,
          file: "message.hl7",
          help: false,
          host: "192.168.1.10",
          json: true,
          port: 2575,
        },
        ok: true,
      });
    });
  });

  describe("error cases", () => {
    it("rejects --host without a value (end of argv)", () => {
      const result = parseSendArgs(["--host"]);
      expect(result).toEqual({ error: "`--host` takes a value.", ok: false });
    });

    it("rejects --host followed by a flag", () => {
      const result = parseSendArgs(["--host", "--json"]);
      expect(result).toEqual({ error: "`--host` takes a value.", ok: false });
    });

    it("rejects --port without a value", () => {
      const result = parseSendArgs(["--port"]);
      expect(result).toEqual({ error: "`--port` takes a value.", ok: false });
    });

    it("rejects --port followed by a flag", () => {
      const result = parseSendArgs(["--port", "--json"]);
      expect(result).toEqual({ error: "`--port` takes a value.", ok: false });
    });

    it("rejects a non-integer --port", () => {
      const result = parseSendArgs(["--port", "abc"]);
      expect(result).toEqual({
        error: "`--port` takes a whole number.",
        ok: false,
      });
    });

    it("rejects a fractional --port", () => {
      const result = parseSendArgs(["--port", "25.7"]);
      expect(result).toEqual({
        error: "`--port` takes a whole number.",
        ok: false,
      });
    });

    it("rejects --config without a value", () => {
      const result = parseSendArgs(["--config"]);
      expect(result).toEqual({
        error: "`--config` takes a value.",
        ok: false,
      });
    });

    it("rejects --config followed by a flag", () => {
      const result = parseSendArgs(["--config", "--json"]);
      expect(result).toEqual({
        error: "`--config` takes a value.",
        ok: false,
      });
    });

    it("rejects --port 0", () => {
      const result = parseSendArgs(["--port", "0"]);
      expect(result).toEqual({
        error: "`--port` takes a port between 1 and 65535.",
        ok: false,
      });
    });

    it("rejects a --port above the highest port number", () => {
      const result = parseSendArgs(["--port", "65536"]);
      expect(result).toEqual({
        error: "`--port` takes a port between 1 and 65535.",
        ok: false,
      });
    });

    it("accepts the highest port number", () => {
      const result = parseSendArgs(["--port", "65535"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.args.port).toBe(65_535);
      }
    });

    it("rejects an unknown flag", () => {
      const result = parseSendArgs(["--raw"]);
      expect(result).toEqual({
        error: "`--raw` is not a `glion send` flag.",
        ok: false,
      });
    });

    it("rejects an unknown short flag", () => {
      const result = parseSendArgs(["-x"]);
      expect(result).toEqual({
        error: "`-x` is not a `glion send` flag.",
        ok: false,
      });
    });

    it("rejects more than one message source", () => {
      const result = parseSendArgs(["a.hl7", "b.hl7"]);
      expect(result).toEqual({
        error: "`glion send` takes one message source.",
        ok: false,
      });
    });

    it("rejects a second source even when the first is the stdin sentinel", () => {
      const result = parseSendArgs(["-", "b.hl7"]);
      expect(result).toEqual({
        error: "`glion send` takes one message source.",
        ok: false,
      });
    });
  });
});
