// oxlint-disable require-await
import { parseHL7v2 } from "@glion/hl7v2";
import { hl7v2Parser } from "@glion/parser";
import { unified } from "unified";

import { createContext } from "../../src/server/context.js";
import type { Hl7v2Processor } from "../../src/server/types.js";

const SAMPLE_MESSAGE = [
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1",
  "EVN|A01|20240101120000",
  "PID|1||12345^^^MRN||Doe^John",
].join("\r");

const SAMPLE_BYTES = new TextEncoder().encode(SAMPLE_MESSAGE);

function makeCtx(raw = SAMPLE_MESSAGE, bytes = SAMPLE_BYTES) {
  return createContext({
    bytes,
    connection: {
      id: 1,
      localPort: 2575,
      remoteAddress: "192.168.1.100",
      remotePort: 54_321,
      secure: false,
      state: new Map(),
    },
    processor: parseHL7v2,
    raw,
  });
}

describe("createContext", () => {
  it("exposes req.raw and req.bytes", () => {
    const ctx = makeCtx();
    expect(ctx.req.raw).toBe(SAMPLE_MESSAGE);
    expect(ctx.req.bytes).toBe(SAMPLE_BYTES);
  });

  it("exposes connection metadata", () => {
    const ctx = makeCtx();
    expect(ctx.connection.remoteAddress).toBe("192.168.1.100");
    expect(ctx.connection.remotePort).toBe(54_321);
    expect(ctx.connection.localPort).toBe(2575);
    expect(ctx.connection.secure).toBe(false);
  });

  it("extracts messageType from MSH-9.1", () => {
    const ctx = makeCtx();
    expect(ctx.messageType).toBe("ADT");
  });

  it("extracts triggerEvent from MSH-9.2", () => {
    const ctx = makeCtx();
    expect(ctx.triggerEvent).toBe("A01");
  });

  it("extracts messageStructure from MSH-9.3", () => {
    const ctx = makeCtx();
    expect(ctx.messageStructure).toBe("ADT_A01");
  });

  it("extracts version from MSH-12", () => {
    const ctx = makeCtx();
    expect(ctx.version).toBe("2.5.1");
  });

  it("extracts controlId from MSH-10", () => {
    const ctx = makeCtx();
    expect(ctx.controlId).toBe("MSG001");
  });

  it("ast is the raw parsed tree (sync)", () => {
    const ctx = makeCtx();
    expect(ctx.ast).toBeDefined();
    expect(ctx.ast.type).toBe("root");
    expect(ctx.ast.children.length).toBeGreaterThan(0);
  });

  it("tree() returns the transformed tree (async, lazy)", async () => {
    const ctx = makeCtx();
    const tree = await ctx.tree();
    expect(tree).toBeDefined();
    expect(tree.type).toBe("root");
    expect(tree.children.length).toBeGreaterThan(0);
  });

  it("populates file as VFile", () => {
    const ctx = makeCtx();
    expect(ctx.file).toBeDefined();
  });

  it("populates result from compiler", async () => {
    // parseHL7v2 includes hl7v2Jsonify, so result should be defined
    const ctx = makeCtx();
    const result = await ctx.result();
    expect(result).toBeDefined();
  });

  it("initializes res as undefined", () => {
    const ctx = makeCtx();
    expect(ctx.res).toBeUndefined();
  });

  describe("processor configurations", () => {
    it("works with parse-only processor (no transformers, no compiler)", async () => {
      const parseOnly = unified().use(hl7v2Parser).freeze() as Hl7v2Processor;

      const ctx = createContext({
        bytes: SAMPLE_BYTES,
        connection: {
          id: 1,
          localPort: 2575,
          remoteAddress: "192.168.1.100",
          remotePort: 54_321,
          secure: false,
          state: new Map(),
        },
        processor: parseOnly,
        raw: SAMPLE_MESSAGE,
      });

      // Tree is parsed correctly
      const tree = await ctx.tree();
      expect(tree.type).toBe("root");
      expect(tree.children.length).toBeGreaterThan(0);

      // Routing fields extracted from tree
      expect(ctx.messageType).toBe("ADT");
      expect(ctx.triggerEvent).toBe("A01");
      expect(ctx.controlId).toBe("MSG001");

      // VFile exists (always created)
      expect(ctx.file).toBeDefined();

      // No compiler → result is undefined
      const result = await ctx.result();
      expect(result).toBeUndefined();
    });

    it("works with full pipeline processor (parse + transform + compile)", async () => {
      const ctx = createContext({
        bytes: SAMPLE_BYTES,
        connection: {
          id: 1,
          localPort: 2575,
          remoteAddress: "192.168.1.100",
          remotePort: 54_321,
          secure: false,
          state: new Map(),
        },
        processor: parseHL7v2,
        raw: SAMPLE_MESSAGE,
      });

      // Tree, file, and result all populated
      const tree = await ctx.tree();
      expect(tree.type).toBe("root");
      expect(ctx.file).toBeDefined();
      const result = await ctx.result();
      expect(result).toBeDefined();

      // Result is the compiled JSON from hl7v2Jsonify
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("lazy pipeline caching", () => {
    it("tree() calls run() exactly once on repeated calls", async () => {
      const spy = vi.spyOn(parseHL7v2, "run");
      const ctx = makeCtx();
      const a = await ctx.tree();
      const b = await ctx.tree();
      expect(a).toBe(b);
      expect(spy).toHaveBeenCalledOnce();
      spy.mockRestore();
    });

    it("concurrent tree() calls share one promise (run() called once)", async () => {
      const spy = vi.spyOn(parseHL7v2, "run");
      const ctx = makeCtx();
      const [a, b] = await Promise.all([ctx.tree(), ctx.tree()]);
      expect(a).toBe(b);
      expect(spy).toHaveBeenCalledOnce();
      spy.mockRestore();
    });

    it("result() internally triggers tree() — run() called once total", async () => {
      const runSpy = vi.spyOn(parseHL7v2, "run");
      const stringifySpy = vi.spyOn(parseHL7v2, "stringify");
      const ctx = makeCtx();

      // Only call result(), never call tree() directly
      await ctx.result();

      // result() must have called getTree() internally, which calls run()
      expect(runSpy).toHaveBeenCalledOnce();
      expect(stringifySpy).toHaveBeenCalledOnce();

      // A subsequent tree() call should NOT trigger run() again
      await ctx.tree();
      expect(runSpy).toHaveBeenCalledOnce();

      runSpy.mockRestore();
      stringifySpy.mockRestore();
    });

    it("result() calls stringify() exactly once on repeated calls", async () => {
      const spy = vi.spyOn(parseHL7v2, "stringify");
      const ctx = makeCtx();
      const a = await ctx.result();
      const b = await ctx.result();
      expect(a).toBe(b);
      expect(spy).toHaveBeenCalledOnce();
      spy.mockRestore();
    });

    it("concurrent result() calls share one promise (stringify() called once)", async () => {
      const runSpy = vi.spyOn(parseHL7v2, "run");
      const stringifySpy = vi.spyOn(parseHL7v2, "stringify");
      const ctx = makeCtx();
      const [a, b] = await Promise.all([ctx.result(), ctx.result()]);
      expect(a).toBe(b);
      expect(runSpy).toHaveBeenCalledOnce();
      expect(stringifySpy).toHaveBeenCalledOnce();
      runSpy.mockRestore();
      stringifySpy.mockRestore();
    });
  });

  describe("variable API", () => {
    it("set and get variables", () => {
      const ctx = makeCtx();
      ctx.set("foo", "bar");
      expect(ctx.get("foo")).toBe("bar");
    });

    it("returns undefined for unset variables", () => {
      const ctx = makeCtx();
      expect(ctx.get("nonexistent")).toBeUndefined();
    });

    it("exposes frozen var snapshot", () => {
      const ctx = makeCtx();
      ctx.set("key1", "val1");
      ctx.set("key2", 42);
      const snapshot = ctx.var;
      expect(snapshot.key1).toBe("val1");
      expect(snapshot.key2).toBe(42);
      expect(Object.isFrozen(snapshot)).toBe(true);
    });
  });

  // https://github.com/rethinkhealth/hl7v2/issues/489
  it("extracts version from composite VID in MSH-12 (2.5.1^USA^ISO)", () => {
    const vidMessage = [
      "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1^USA^ISO",
      "EVN|A01|20240101120000",
      "PID|1||12345^^^MRN||Doe^John",
    ].join("\r");
    const vidBytes = new TextEncoder().encode(vidMessage);

    const ctx = makeCtx(vidMessage, vidBytes);

    expect(ctx.version).toBe("2.5.1");
  });
});
