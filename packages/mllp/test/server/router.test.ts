// oxlint-disable require-await
import { parseHL7v2 } from "@glion/hl7v2";

import { createContext } from "../../src/server/context.js";
import { Router } from "../../src/server/router.js";
import type { Context, Middleware } from "../../src/server/types.js";

const RESPONSE_OK = { raw: "MSA|AA|OK" };

const CONNECTION = {
  localPort: 2575,
  remoteAddress: "127.0.0.1",
  remotePort: 12_345,
  secure: false,
};

function makeCtx(raw: string): Context {
  return createContext({
    bytes: new TextEncoder().encode(raw),
    connection: CONNECTION,
    processor: parseHL7v2,
    raw,
  });
}

const ADT_A01 = [
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1",
  "PID|1||12345",
].join("\r");

const ADT_A08 = [
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A08|MSG002|P|2.5.1",
  "PID|1||12345",
].join("\r");

const ORU_R01 = [
  "MSH|^~\\&|Lab|Fac|App|Fac|20240101||ORU^R01|MSG003|P|2.5.1",
  "OBR|1||LAB123|CBC",
].join("\r");

const ADT_A01_V23 = [
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01|MSG004|P|2.3",
  "PID|1||12345",
].join("\r");

describe("Router", () => {
  describe("string pattern matching", () => {
    it("matches exact pattern", async () => {
      const router = new Router();
      const handler = async () => RESPONSE_OK;
      router.add("ADT^A01", handler);

      const result = router.match(makeCtx(ADT_A01));
      expect(result.handler).toBe(handler);
    });

    it("returns undefined for no match", async () => {
      const router = new Router();
      router.add("ADT^A01", async () => RESPONSE_OK);

      const result = router.match(makeCtx(ORU_R01));
      expect(result.handler).toBeUndefined();
    });

    it("matches wildcard catch-all", async () => {
      const router = new Router();
      const handler = async () => RESPONSE_OK;
      router.add("*", handler);

      expect(router.match(makeCtx(ADT_A01)).handler).toBe(handler);
      expect(router.match(makeCtx(ORU_R01)).handler).toBe(handler);
    });

    it("matches message type wildcard", async () => {
      const router = new Router();
      const handler = async () => RESPONSE_OK;
      router.add("ADT^*", handler);

      expect(router.match(makeCtx(ADT_A01)).handler).toBe(handler);
      expect(router.match(makeCtx(ADT_A08)).handler).toBe(handler);
      expect(router.match(makeCtx(ORU_R01)).handler).toBeUndefined();
    });

    it("uses first-match-wins ordering", async () => {
      const router = new Router();
      const specific = async () => ({ raw: "specific" });
      const catchAll = async () => ({ raw: "catchAll" });
      router.add("ADT^A01", specific);
      router.add("*", catchAll);

      expect(router.match(makeCtx(ADT_A01)).handler).toBe(specific);
      expect(router.match(makeCtx(ORU_R01)).handler).toBe(catchAll);
    });
  });

  describe("filter function matching", () => {
    it("matches with a filter function", async () => {
      const router = new Router();
      const handler = async () => RESPONSE_OK;
      router.add((ctx) => ctx.messageType === "ADT", handler);

      expect(router.match(makeCtx(ADT_A01)).handler).toBe(handler);
      expect(router.match(makeCtx(ORU_R01)).handler).toBeUndefined();
    });

    it("filter can inspect triggerEvent", async () => {
      const router = new Router();
      const handler = async () => RESPONSE_OK;
      router.add(
        (ctx) => ctx.messageType === "ADT" && ctx.triggerEvent === "A01",
        handler
      );

      expect(router.match(makeCtx(ADT_A01)).handler).toBe(handler);
      expect(router.match(makeCtx(ADT_A08)).handler).toBeUndefined();
    });

    it("filter can inspect version", async () => {
      const router = new Router();
      const handler = async () => RESPONSE_OK;
      router.add(
        (ctx) => ctx.messageType === "ADT" && ctx.version === "2.3",
        handler
      );

      expect(router.match(makeCtx(ADT_A01_V23)).handler).toBe(handler);
      expect(router.match(makeCtx(ADT_A01)).handler).toBeUndefined();
    });

    it("filter can inspect controlId", async () => {
      const router = new Router();
      const handler = async () => RESPONSE_OK;
      router.add((ctx) => ctx.controlId === "MSG001", handler);

      expect(router.match(makeCtx(ADT_A01)).handler).toBe(handler);
      expect(router.match(makeCtx(ORU_R01)).handler).toBeUndefined();
    });

    it("filter can inspect connection metadata", async () => {
      const router = new Router();
      const handler = async () => RESPONSE_OK;
      router.add(
        (ctx) => ctx.connection.remoteAddress === "127.0.0.1",
        handler
      );

      expect(router.match(makeCtx(ADT_A01)).handler).toBe(handler);
    });

    it("filter can inspect the raw parsed AST", () => {
      const router = new Router();
      const handler = async () => RESPONSE_OK;
      router.add((ctx) => ctx.ast.children.length > 1, handler);

      expect(router.match(makeCtx(ADT_A01)).handler).toBe(handler);
    });

    it("filter respects first-match-wins with string patterns", async () => {
      const router = new Router();
      const filterHandler = async () => ({ raw: "filter" });
      const stringHandler = async () => ({ raw: "string" });
      router.add((ctx) => ctx.messageType === "ADT", filterHandler);
      router.add("ADT^A01", stringHandler);

      // Filter registered first, should win
      expect(router.match(makeCtx(ADT_A01)).handler).toBe(filterHandler);
    });

    it("string pattern wins when registered before filter", async () => {
      const router = new Router();
      const stringHandler = async () => ({ raw: "string" });
      const filterHandler = async () => ({ raw: "filter" });
      router.add("ADT^A01", stringHandler);
      router.add((ctx) => ctx.messageType === "ADT", filterHandler);

      expect(router.match(makeCtx(ADT_A01)).handler).toBe(stringHandler);
    });
  });

  describe("middleware", () => {
    it("collects global middleware for all messages", async () => {
      const router = new Router();
      const mw: Middleware = async (_ctx, next) => next();
      router.addMiddleware(mw);

      const result = router.match(makeCtx(ADT_A01));
      expect(result.middlewares).toContain(mw);
    });

    it("collects scoped middleware only when string pattern matches", async () => {
      const router = new Router();
      const adtMw: Middleware = async (_ctx, next) => next();
      const oruMw: Middleware = async (_ctx, next) => next();
      router.addMiddleware("ADT^*", adtMw);
      router.addMiddleware("ORU^*", oruMw);

      const adtResult = router.match(makeCtx(ADT_A01));
      expect(adtResult.middlewares).toContain(adtMw);
      expect(adtResult.middlewares).not.toContain(oruMw);

      const oruResult = router.match(makeCtx(ORU_R01));
      expect(oruResult.middlewares).toContain(oruMw);
      expect(oruResult.middlewares).not.toContain(adtMw);
    });

    it("collects scoped middleware with filter function", async () => {
      const router = new Router();
      const mw: Middleware = async (_ctx, next) => next();
      router.addMiddleware((ctx) => ctx.version === "2.5.1", mw);

      const result251 = router.match(makeCtx(ADT_A01));
      expect(result251.middlewares).toContain(mw);

      const result23 = router.match(makeCtx(ADT_A01_V23));
      expect(result23.middlewares).not.toContain(mw);
    });

    it("combines global and scoped middleware", async () => {
      const router = new Router();
      const globalMw: Middleware = async (_ctx, next) => next();
      const scopedMw: Middleware = async (_ctx, next) => next();
      router.addMiddleware(globalMw);
      router.addMiddleware("ADT^*", scopedMw);

      const result = router.match(makeCtx(ADT_A01));
      expect(result.middlewares).toEqual([globalMw, scopedMw]);
    });

    it("preserves middleware registration order", async () => {
      const router = new Router();
      const mw1: Middleware = async (_ctx, next) => next();
      const mw2: Middleware = async (_ctx, next) => next();
      const mw3: Middleware = async (_ctx, next) => next();
      router.addMiddleware(mw1);
      router.addMiddleware(mw2);
      router.addMiddleware(mw3);

      const result = router.match(makeCtx(ADT_A01));
      expect(result.middlewares).toEqual([mw1, mw2, mw3]);
    });
  });
});
