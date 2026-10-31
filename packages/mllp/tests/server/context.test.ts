// oxlint-disable require-await
import { parseHL7v2 } from "@glion/hl7v2";
import { hl7v2Parser } from "@glion/parser";
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
    env: undefined,
    request: await parseRequest(payload, parseHL7v2),
  });
}

describe("createContext", () => {
  it("exposes req.raw", async () => {
    const ctx = await makeCtx();
    expect(ctx.req.raw).toBe(SAMPLE_MESSAGE);
  });

  it("keeps the header as parsed when a handler changes ctx.req.tree", async () => {
    const ctx = await makeCtx();
    const controlId = value(ctx.req.tree, "MSH.10")?.node;
    if (controlId?.type !== "subcomponent") {
      throw new Error("The sample message has no MSH-10.");
    }
    controlId.value = "CHANGED";

    expect(ctx.req.header.controlId).toBe("MSG001");
  });

  it("exposes what the runtime passed to handle() as ctx.env", async () => {
    const env = { region: "north" };
    const ctx = createContext({
      env,
      request: await parseRequest(SAMPLE_BYTES, parseHL7v2),
    });
    expect(ctx.env).toBe(env);
  });

  it("holds the request parseRequest() read as req", async () => {
    const request = await parseRequest(SAMPLE_BYTES, parseHL7v2);
    const ctx = createContext({
      env: undefined,
      request,
    });
    expect(ctx.req).toBe(request);
  });

  it("initializes res as undefined", async () => {
    const ctx = await makeCtx();
    expect(ctx.res).toBeUndefined();
  });

  describe("processor configurations", () => {
    it("works with parse-only processor (no transformers, no compiler)", async () => {
      const parseOnly = unified().use(hl7v2Parser).freeze();

      const ctx = createContext({
        env: undefined,
        request: await parseRequest(SAMPLE_BYTES, parseOnly),
      });

      // Tree is parsed correctly
      const { tree } = ctx.req;
      expect(tree.type).toBe("root");
      expect(tree.children.length).toBeGreaterThan(0);

      // Routing fields extracted from tree
      expect(ctx.req.header.messageCode).toBe("ADT");
      expect(ctx.req.header.triggerEvent).toBe("A01");
      expect(ctx.req.header.controlId).toBe("MSG001");

      // VFile exists (always created)
      expect(ctx.req.file).toBeDefined();

      // No compiler → result is undefined
      const result = await ctx.req.result();
      expect(result).toBeUndefined();
    });

    it("works with full pipeline processor (parse + transform + compile)", async () => {
      const ctx = createContext({
        env: undefined,
        request: await parseRequest(SAMPLE_BYTES, parseHL7v2),
      });

      // Tree, file, and result all populated
      const { tree } = ctx.req;
      expect(tree.type).toBe("root");
      expect(ctx.req.file).toBeDefined();
      const result = await ctx.req.result();
      expect(result).toBeDefined();

      // Result is the compiled JSON from hl7v2Jsonify
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("compiled result", () => {
    it("result() calls stringify() exactly once on repeated calls", async () => {
      const spy = vi.spyOn(parseHL7v2, "stringify");
      const ctx = await makeCtx();
      const a = await ctx.req.result();
      const b = await ctx.req.result();
      expect(a).toBe(b);
      expect(spy).toHaveBeenCalledOnce();
      spy.mockRestore();
    });

    it("concurrent result() calls share one promise (stringify() called once)", async () => {
      const spy = vi.spyOn(parseHL7v2, "stringify");
      const ctx = await makeCtx();
      const [a, b] = await Promise.all([ctx.req.result(), ctx.req.result()]);
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

    expect(ctx.req.header.version).toBe("2.5.1");
  });
});
