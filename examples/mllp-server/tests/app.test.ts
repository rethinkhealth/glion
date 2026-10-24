import { readFileSync } from "node:fs";
import { connect } from "node:net";

import { AckApplicationError, AckApplicationReject } from "@glion/ack";
import { MllpClient } from "@glion/mllp-client";
import { nodeSocket } from "@glion/mllp-client/node";
import { serve } from "@glion/mllp/node";
import { parseHL7v2 } from "@glion/parser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import app from "../src/app";

const sample = (name: string) =>
  parseHL7v2(
    readFileSync(new URL(`../samples/${name}`, import.meta.url), "utf8")
  );

const server = serve(app, { hostname: "127.0.0.1", port: 0 });
let client: MllpClient;

beforeAll(async () => {
  await server.listening;
  client = new MllpClient({
    socket: nodeSocket(() => connect({ host: "127.0.0.1", port: server.port })),
  });
});

afterAll(async () => {
  await client.close();
  await server.close();
});

describe("mllp-server", () => {
  it("accepts an admission", async () => {
    const ack = await client.send(sample("adt-a01.hl7"));

    expect(ack.code).toBe("AA");
    expect(ack.controlId).toBe("MSG001");
  });

  it("accepts results for a patient it admitted", async () => {
    await client.send(sample("adt-a01.hl7"));

    const ack = await client.send(sample("oru-r01.hl7"));

    expect(ack.code).toBe("AA");
    expect(ack.controlId).toBe("MSG002");
  });

  it("rejects results for a patient it has not admitted with AE and error code 204", async () => {
    const rejection = await client
      .send(sample("oru-r01-unknown-patient.hl7"))
      .catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(AckApplicationError);
    expect(rejection).toMatchObject({
      code: "AE",
      controlId: "MSG003",
      errorCode: "204",
      severity: "E",
      text: "The patient is not on file.",
    });
  });

  it("rejects a message missing a required field with AE and error code 101", async () => {
    const rejection = await client
      .send(sample("adt-a01-invalid.hl7"))
      .catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(AckApplicationError);
    expect(rejection).toMatchObject({
      code: "AE",
      controlId: "MSG004",
      errorCode: "101",
      text: "Field `PID-3` (Patient Identifier List) is not present; it is required.",
    });
  });

  it("rejects a message type it has no route for with AR and error code 200", async () => {
    const rejection = await client
      .send(sample("siu-s12.hl7"))
      .catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(AckApplicationReject);
    expect(rejection).toMatchObject({
      code: "AR",
      controlId: "MSG005",
      errorCode: "200",
      text: "The message type is not one this server receives.",
    });
  });
});
