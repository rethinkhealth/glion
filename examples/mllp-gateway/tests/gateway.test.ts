import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { connect, createServer } from "node:net";

import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";
import { serve } from "@glion/mllp/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { gateway } from "../src/gateway.ts";
import type { Gateway, GatewayOptions } from "../src/gateway.ts";

const ack = (code: string, controlId: string, err = "") =>
  `MSH|^~\\&|R|R|S|S|20240101120000||ACK^A01^ACK|ACK${controlId}|P|2.5.1\rMSA|${code}|${controlId}${err}`;

// Accepts ADT^A01, refuses ORU^R01, and never answers SIU^S12.
const receiver = serve(
  new Mllp()
    .parser(parseHL7v2)
    .on("ADT^A01", (ctx) => ({ raw: ack("AA", ctx.controlId) }))
    .on("ORU^R01", (ctx) => ({
      raw: ack(
        "AE",
        ctx.controlId,
        "|The patient is not on file.\rERR|||204^^HL70357|E"
      ),
    }))
    .on("SIU^S12", () => {}),
  { hostname: "127.0.0.1", port: 0 }
);

const message = (type: string, controlId: string) =>
  `MSH|^~\\&|S|S|R|R|20240101120000||${type}|${controlId}|P|2.5.1\nPID|1||123456^^^MR||DOE^JOHN`;

const started: Gateway[] = [];

/** Starts a gateway with `options` and returns its `/messages` URL. */
async function start(options: Omit<GatewayOptions, "dial"> & { port: number }) {
  const { port, ...rest } = options;
  const instance = gateway({
    ...rest,
    dial: () => connect({ host: "127.0.0.1", port }),
  });
  started.push(instance);
  instance.server.listen(0, "127.0.0.1");
  await once(instance.server, "listening");
  const { port: http } = instance.server.address() as AddressInfo;
  return `http://127.0.0.1:${http}/messages`;
}

const post = (url: string, body: string, type = "x-application/hl7-v2+er7") =>
  fetch(url, { body, headers: { "content-type": type }, method: "POST" });

let url: string;

beforeAll(async () => {
  await receiver.listening;
  url = await start({ port: receiver.port, sendTimeoutMs: 200 });
});

afterAll(async () => {
  await Promise.all(started.map((instance) => instance.close()));
  await receiver.close();
});

describe("mllp-gateway", () => {
  it("answers 200 with the acknowledgment when the receiving system accepts the message", async () => {
    const response = await post(url, message("ADT^A01", "MSG001"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: "AA", controlId: "MSG001" });
  });

  it("answers 422 with the receiving system's error when it refuses the message", async () => {
    const response = await post(url, message("ORU^R01", "MSG002"));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      code: "AE",
      controlId: "MSG002",
      errorCode: "204",
      severity: "E",
      text: "The patient is not on file.",
    });
  });

  it("answers 400 without sending when the body has no message control ID", async () => {
    const response = await post(url, "not an HL7v2 message");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "INVALID_MESSAGE",
      delivery: "not-sent",
    });
  });

  it("answers 504 when no acknowledgment arrives in time, and sends the next message on a new connection", async () => {
    const timedOut = await post(url, message("SIU^S12", "MSG003"));
    const next = await post(url, message("ADT^A01", "MSG004"));

    expect(timedOut.status).toBe(504);
    expect(await timedOut.json()).toMatchObject({
      code: "SEND_TIMEOUT",
      delivery: "unknown",
    });
    expect(next.status).toBe(200);
  });

  it("answers 503 with Retry-After when the receiving system cannot be reached", async () => {
    const closed = createServer().listen(0, "127.0.0.1");
    await once(closed, "listening");
    const { port } = closed.address() as AddressInfo;
    closed.close();
    const unreachable = await start({ port, reconnect: false });

    const response = await post(unreachable, message("ADT^A01", "MSG005"));

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(await response.json()).toMatchObject({
      code: "CONNECTION_FAILED",
      delivery: "not-sent",
    });
  });

  it("answers 405 to a method other than POST", async () => {
    const response = await fetch(url);

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("answers 415 to a body that is not declared as an HL7v2 message", async () => {
    const response = await post(
      url,
      message("ADT^A01", "MSG006"),
      "application/json"
    );

    expect(response.status).toBe(415);
  });

  it("answers 413 to a body larger than 1 MiB", async () => {
    const response = await post(url, "A".repeat(1024 * 1024 + 1));

    expect(response.status).toBe(413);
  });
});
