// oxlint-disable require-await
import { parseHL7v2 } from "@glion/hl7v2";

import { createContext } from "../../src/server/context.js";
import { Router } from "../../src/server/router.js";
import type { Context, Middleware } from "../../src/server/types.js";

const CONNECTION = {
  id: 1,
  localPort: 2575,
  remoteAddress: "127.0.0.1",
  remotePort: 12_345,
  secure: false,
  state: new Map(),
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

describe("Router addMiddleware prepend", () => {
  it("appends by default (prepend=false)", () => {
    const router = new Router();
    const mw1: Middleware = async (_ctx, next) => next();
    const mw2: Middleware = async (_ctx, next) => next();
    router.addMiddleware(mw1);
    router.addMiddleware(mw2);

    const result = router.match(makeCtx(ADT_A01));
    expect(result.middlewares).toEqual([mw1, mw2]);
  });

  it("prepends when prepend=true", () => {
    const router = new Router();
    const mw1: Middleware = async (_ctx, next) => next();
    const mw2: Middleware = async (_ctx, next) => next();
    router.addMiddleware(mw1);
    router.addMiddleware(mw2, true);

    const result = router.match(makeCtx(ADT_A01));
    expect(result.middlewares).toEqual([mw2, mw1]);
  });

  it("prepend=false behaves like default append", () => {
    const router = new Router();
    const mw1: Middleware = async (_ctx, next) => next();
    const mw2: Middleware = async (_ctx, next) => next();
    router.addMiddleware(mw1);
    router.addMiddleware(mw2, false);

    const result = router.match(makeCtx(ADT_A01));
    expect(result.middlewares).toEqual([mw1, mw2]);
  });

  it("multiple prepends stack in LIFO order", () => {
    const router = new Router();
    const mw1: Middleware = async (_ctx, next) => next();
    const mw2: Middleware = async (_ctx, next) => next();
    const mw3: Middleware = async (_ctx, next) => next();
    router.addMiddleware(mw1);
    router.addMiddleware(mw2, true);
    router.addMiddleware(mw3, true);

    const result = router.match(makeCtx(ADT_A01));
    // mw3 prepended last → front, mw2 prepended first → second, mw1 appended → last
    expect(result.middlewares).toEqual([mw3, mw2, mw1]);
  });

  it("prepend does not affect scoped middleware", () => {
    const router = new Router();
    const globalMw: Middleware = async (_ctx, next) => next();
    const scopedMw: Middleware = async (_ctx, next) => next();
    const prependedMw: Middleware = async (_ctx, next) => next();

    router.addMiddleware(globalMw);
    router.addMiddleware("ADT^*", scopedMw);
    router.addMiddleware(prependedMw, true);

    const result = router.match(makeCtx(ADT_A01));
    // Global middleware: [prependedMw, globalMw], then scoped: [scopedMw]
    expect(result.middlewares).toEqual([prependedMw, globalMw, scopedMw]);
  });
});
