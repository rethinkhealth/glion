// oxlint-disable require-await
import { parseHL7v2 } from "@glion/hl7v2";
import { hl7v2Parser } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { value } from "@glion/util-query";
import { unified } from "unified";

import { createContext } from "../../src/server/context";
import { parseRequest } from "../../src/server/request";
import type { MllpResponse } from "../../src/server/response";
import type { AckOptions } from "../../src/server/types";

const SAMPLE_MESSAGE = [
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1",
  "EVN|A01|20240101120000",
  "PID|1||12345^^^MRN||Doe^John",
].join("\r");

const SAMPLE_BYTES = new TextEncoder().encode(SAMPLE_MESSAGE);

const decode = (reply: MllpResponse) => new TextDecoder().decode(reply.bytes);

async function makeCtx(payload = SAMPLE_BYTES) {
  return createContext({
    app: { serializer: toHl7v2 },
    env: undefined,
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
    expect(new TextDecoder().decode(ctx.ack().bytes).split("\r")[1]).toBe(
      "MSA|AA|CHANGED"
    );
  });

  it("exposes what the runtime passed to handle() as ctx.env", async () => {
    const env = { region: "north" };
    const ctx = createContext({
      app: { serializer: toHl7v2 },
      env,
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

  describe("ctx.ack()", () => {
    it("is the acknowledgment as an MllpResponse, AA by default", async () => {
      const ctx = await makeCtx();
      const reply = ctx.ack();

      expect(reply.code).toBe("AA");
      expect(decode(reply).split("\r")[1]).toBe("MSA|AA|MSG001");
    });

    it("writes the accept code it is given", async () => {
      const ctx = await makeCtx();
      const reply = ctx.ack({ code: "CA" });

      expect(reply.code).toBe("CA");
      expect(decode(reply).split("\r")[1]).toBe("MSA|CA|MSG001");
    });

    it("throws RESPONSE_IS_NAK for a NAK code", async () => {
      const ctx = await makeCtx();

      expect(() => ctx.ack({ code: "AE" } as unknown as AckOptions)).toThrow(
        expect.objectContaining({
          code: "RESPONSE_IS_NAK",
          message:
            "The response's acknowledgment code (MSA-1) is a NAK code; a response accepts the message, and a NAK is the response to a thrown error.",
        })
      );
    });
  });

  describe("ctx.reply()", () => {
    it("serializes the message when called, with its MSA-1 as the code", async () => {
      const tree = parseHL7v2.parse(
        "MSH|^~\\&|RecvApp|RecvFac|||||RSP^K22^RSP_K21|R1|P|2.5.1\rMSA|AA|MSG001\rQAK|Q1|OK"
      );
      const ctx = await makeCtx();
      const reply = ctx.reply(tree);
      tree.children.pop();

      expect(reply.code).toBe("AA");
      expect(decode(reply)).toBe(
        "MSH|^~\\&|RecvApp|RecvFac|||||RSP^K22^RSP_K21|R1|P|2.5.1\rMSA|AA|MSG001\rQAK|Q1|OK"
      );
    });

    it("gives a message with no acknowledgment code in MSA-1 no code", async () => {
      const ctx = await makeCtx();
      const reply = ctx.reply(
        parseHL7v2.parse("MSH|^~\\&|||||||ADT^A08|R2|P|2.5.1\rPID|1||12345")
      );

      expect(reply.code).toBeUndefined();
    });

    it("throws RESPONSE_IS_NAK for a message whose MSA-1 is a NAK code", async () => {
      const ctx = await makeCtx();
      const nak = parseHL7v2.parse("MSH|^~\\&||||||||||2.5.1\rMSA|CR|MSG001");

      expect(() => ctx.reply(nak)).toThrow(
        expect.objectContaining({ code: "RESPONSE_IS_NAK" })
      );
    });

    it("throws RESPONSE_WITHOUT_MSH for a message that does not start with an MSH", async () => {
      const ctx = await makeCtx();

      expect(() => ctx.reply(parseHL7v2.parse("MSA|AA|MSG001"))).toThrow(
        expect.objectContaining({
          code: "RESPONSE_WITHOUT_MSH",
          message:
            "The response does not start with the message header segment (`MSH`); an HL7v2 message starts with one.",
        })
      );
      expect(() => ctx.reply({ children: [], type: "root" })).toThrow(
        expect.objectContaining({ code: "RESPONSE_WITHOUT_MSH" })
      );
    });
  });

  describe("ctx.res", () => {
    it("starts as no response, and holds the MllpResponse written to it", async () => {
      const ctx = await makeCtx();
      expect(ctx.res).toBeUndefined();

      const reply = ctx.ack();
      ctx.res = reply;
      expect(ctx.res).toBe(reply);

      ctx.res = undefined;
      expect(ctx.res).toBeUndefined();
    });

    it("throws INVALID_RESPONSE for a value that is not an MllpResponse, and keeps the response it held", async () => {
      const ctx = await makeCtx();
      const reply = ctx.ack();
      ctx.res = reply;

      expect(() => {
        ctx.res = parseHL7v2.parse(SAMPLE_MESSAGE) as unknown as MllpResponse;
      }).toThrow(expect.objectContaining({ code: "INVALID_RESPONSE" }));
      expect(ctx.res).toBe(reply);
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
