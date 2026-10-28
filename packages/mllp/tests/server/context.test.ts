// oxlint-disable require-await
import { parseHL7v2 } from "@glion/hl7v2";
import { hl7v2Parser } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { value } from "@glion/util-query";
import { unified } from "unified";

import { createContext } from "../../src/server/context";
import { parseRequest } from "../../src/server/request";

const SAMPLE_MESSAGE = [
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1",
  "EVN|A01|20240101120000",
  "PID|1||12345^^^MRN||Doe^John",
].join("\r");

const SAMPLE_BYTES = new TextEncoder().encode(SAMPLE_MESSAGE);

async function makeCtx(payload = SAMPLE_BYTES) {
  return createContext({
    app: { serializer: toHl7v2 },
    env: undefined,
    processor: parseHL7v2,
    request: await parseRequest(payload, parseHL7v2),
  });
}

describe("createContext", () => {
  it("exposes req.raw", async () => {
    const ctx = await makeCtx();
    expect(ctx.req.raw).toBe(SAMPLE_MESSAGE);
  });

  it("starts with no error", async () => {
    const ctx = await makeCtx();
    expect(ctx.error).toBeUndefined();
  });

  it("keeps the routing fields as parsed, and acknowledges the MSH as it is, when a handler changes ctx.ast", async () => {
    const ctx = await makeCtx();
    const controlId = value(ctx.ast, "MSH.10")?.node;
    if (controlId?.type !== "subcomponent") {
      throw new Error("The sample message has no MSH-10.");
    }
    controlId.value = "CHANGED";

    expect(ctx.controlId).toBe("MSG001");
    expect(ctx.ack().raw.split("\r")[1]).toBe("MSA|AA|CHANGED");
  });

  it("exposes what the runtime passed to handle() as ctx.env", async () => {
    const env = { region: "north" };
    const ctx = createContext({
      app: { serializer: toHl7v2 },
      env,
      processor: parseHL7v2,
      request: await parseRequest(SAMPLE_BYTES, parseHL7v2),
    });
    expect(ctx.env).toBe(env);
  });

  it("extracts messageType from MSH-9.1", async () => {
    const ctx = await makeCtx();
    expect(ctx.messageType).toBe("ADT");
  });

  it("extracts triggerEvent from MSH-9.2", async () => {
    const ctx = await makeCtx();
    expect(ctx.triggerEvent).toBe("A01");
  });

  it("extracts messageStructure from MSH-9.3", async () => {
    const ctx = await makeCtx();
    expect(ctx.messageStructure).toBe("ADT_A01");
  });

  it("extracts version from MSH-12", async () => {
    const ctx = await makeCtx();
    expect(ctx.version).toBe("2.5.1");
  });

  it("extracts controlId from MSH-10", async () => {
    const ctx = await makeCtx();
    expect(ctx.controlId).toBe("MSG001");
  });

  it("ast is the tree the processor read", async () => {
    const ctx = await makeCtx();
    expect(ctx.ast).toBeDefined();
    expect(ctx.ast.type).toBe("root");
    expect(ctx.ast.children.length).toBeGreaterThan(0);
  });

  it("tree() returns the tree the processor read", async () => {
    const ctx = await makeCtx();
    const tree = await ctx.tree();
    expect(tree).toBeDefined();
    expect(tree.type).toBe("root");
    expect(tree.children.length).toBeGreaterThan(0);
  });

  it("populates file as VFile", async () => {
    const ctx = await makeCtx();
    expect(ctx.file).toBeDefined();
  });

  it("populates result from compiler", async () => {
    // parseHL7v2 includes hl7v2Jsonify, so result should be defined
    const ctx = await makeCtx();
    const result = await ctx.result();
    expect(result).toBeDefined();
  });

  it("initializes res as undefined", async () => {
    const ctx = await makeCtx();
    expect(ctx.res).toBeUndefined();
  });

  describe("processor configurations", () => {
    it("works with parse-only processor (no transformers, no compiler)", async () => {
      const parseOnly = unified().use(hl7v2Parser).freeze();

      const ctx = createContext({
        app: { serializer: toHl7v2 },
        env: undefined,
        processor: parseOnly,
        request: await parseRequest(SAMPLE_BYTES, parseOnly),
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
        app: { serializer: toHl7v2 },
        env: undefined,
        processor: parseHL7v2,
        request: await parseRequest(SAMPLE_BYTES, parseHL7v2),
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

  describe("compiled result", () => {
    it("tree() resolves to ast", async () => {
      const ctx = await makeCtx();
      expect(await ctx.tree()).toBe(ctx.ast);
    });

    it("result() calls stringify() exactly once on repeated calls", async () => {
      const spy = vi.spyOn(parseHL7v2, "stringify");
      const ctx = await makeCtx();
      const a = await ctx.result();
      const b = await ctx.result();
      expect(a).toBe(b);
      expect(spy).toHaveBeenCalledOnce();
      spy.mockRestore();
    });

    it("concurrent result() calls share one promise (stringify() called once)", async () => {
      const spy = vi.spyOn(parseHL7v2, "stringify");
      const ctx = await makeCtx();
      const [a, b] = await Promise.all([ctx.result(), ctx.result()]);
      expect(a).toBe(b);
      expect(spy).toHaveBeenCalledOnce();
      spy.mockRestore();
    });
  });

  describe("variable API", () => {
    it("set and get variables", async () => {
      const ctx = await makeCtx();
      ctx.set("foo", "bar");
      expect(ctx.get("foo")).toBe("bar");
    });

    it("returns undefined for unset variables", async () => {
      const ctx = await makeCtx();
      expect(ctx.get("nonexistent")).toBeUndefined();
    });

    it("exposes frozen var snapshot", async () => {
      const ctx = await makeCtx();
      ctx.set("key1", "val1");
      ctx.set("key2", 42);
      const snapshot = ctx.var;
      expect(snapshot.key1).toBe("val1");
      expect(snapshot.key2).toBe(42);
      expect(Object.isFrozen(snapshot)).toBe(true);
    });
  });

  // https://github.com/rethinkhealth/hl7v2/issues/489
  it("extracts version from composite VID in MSH-12 (2.5.1^USA^ISO)", async () => {
    const vidMessage = [
      "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1^USA^ISO",
      "EVN|A01|20240101120000",
      "PID|1||12345^^^MRN||Doe^John",
    ].join("\r");
    const vidBytes = new TextEncoder().encode(vidMessage);

    const ctx = await makeCtx(vidBytes);

    expect(ctx.version).toBe("2.5.1");
  });
});
