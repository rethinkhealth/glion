import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Socket } from "node:net";

import { AckException } from "@glion/ack";
import { MllpClient, MllpClientError, MllpErrorCode } from "@glion/mllp-client";
import type { MllpClientOptions } from "@glion/mllp-client";
import { nodeSocket } from "@glion/mllp-client/node";
import { parseHL7v2 } from "@glion/parser";

const MAX_BODY_BYTES = 1024 * 1024;
const RETRY_AFTER_SECONDS = "30";
const CONTENT_TYPES = new Set(["text/plain", "x-application/hl7-v2+er7"]);

export interface GatewayOptions extends Omit<MllpClientOptions, "socket"> {
  /**
   * Opens a connection to the receiving system: `net.connect()` or
   * `tls.connect()`.
   */
  readonly dial: () => Socket;
}

export interface Gateway {
  /** The HTTP server. Not listening until `server.listen()` is called. */
  readonly server: Server;
  /**
   * Stops accepting requests, answers the ones in progress, then closes the
   * connection to the receiving system. Never rejects.
   */
  close(): Promise<void>;
}

/**
 * An HTTP server that sends the HL7v2 message in the body of each
 * `POST /messages` to one receiving system over MLLP, and answers with the
 * receiving system's acknowledgment as JSON.
 *
 * | Outcome                                              | Status |
 * | ---------------------------------------------------- | ------ |
 * | Accepted (`AA`, `CA`)                                | 200    |
 * | Refused (`AE`, `AR`, `CE`, `CR`)                     | 422    |
 * | Not a message that can be sent                       | 400    |
 * | Not sent: the receiving system cannot be reached     | 503    |
 * | Sent, outcome unknown: no reply, or the link dropped | 502    |
 * | Sent, outcome unknown: no reply in time              | 504    |
 *
 * Messages go out one at a time, in the order their requests arrived.
 */
export function gateway({ dial, ...options }: GatewayOptions): Gateway {
  const open = () =>
    new MllpClient({ ...options, socket: nodeSocket(dial) }).on(
      "close",
      (error) => {
        if (error) {
          console.warn(`The MLLP connection closed on ${error.code}.`);
        }
      }
    );

  let client = open();

  // A client that has closed stays closed; the next message opens a new one.
  const current = () => {
    if (client.state === "closed") {
      client = open();
    }
    return client;
  };

  const forward = async (
    request: IncomingMessage,
    response: ServerResponse
  ) => {
    if (request.url !== "/messages") {
      return reply(response, 404, {
        error: "The gateway receives messages at `/messages` only.",
      });
    }
    if (request.method !== "POST") {
      response.setHeader("allow", "POST");
      return reply(response, 405, {
        error: "The gateway receives messages through `POST` only.",
      });
    }
    const type = request.headers["content-type"]?.split(";")[0]?.trim();
    if (!(type && CONTENT_TYPES.has(type))) {
      return reply(response, 415, {
        error:
          "The body is not an HL7v2 message; send it as `text/plain` or `x-application/hl7-v2+er7`.",
      });
    }

    const body = await read(request);
    if (body === undefined) {
      response.setHeader("connection", "close");
      return reply(response, 413, {
        error: `The body is larger than ${MAX_BODY_BYTES} bytes, the most the gateway accepts.`,
      });
    }

    try {
      const ack = await current().send(parseHL7v2(body));
      return reply(response, 200, {
        code: ack.code,
        controlId: ack.controlId,
        text: ack.text,
      });
    } catch (error) {
      if (error instanceof AckException) {
        return reply(response, 422, {
          code: error.code,
          controlId: error.controlId,
          errorCode: error.errorCode,
          severity: error.severity,
          text: error.text,
        });
      }
      if (error instanceof MllpClientError) {
        return refuse(response, error);
      }
      throw error;
    }
  };

  const server = createServer(async (request, response) => {
    try {
      await forward(request, response);
    } catch (error) {
      console.error("The gateway could not answer a request.", error);
      reply(response, 500, { error: "The gateway failed; see its log." });
    }
  });

  return {
    async close() {
      await server[Symbol.asyncDispose]();
      await client.close();
    },
    server,
  };
}

/** Answers a request whose message the client could not deliver, or may have. */
function refuse(response: ServerResponse, error: MllpClientError): void {
  const body = { code: error.code, delivery: error.delivery };
  switch (error.code) {
    case MllpErrorCode.INVALID_MESSAGE: {
      return reply(response, 400, {
        ...body,
        error:
          "The body is not a message the gateway can send; it needs an MSH segment with a message control ID (MSH-10).",
      });
    }
    case MllpErrorCode.CLOSED:
    case MllpErrorCode.CONNECTION_FAILED:
    case MllpErrorCode.CONNECTION_TIMEOUT: {
      response.setHeader("retry-after", RETRY_AFTER_SECONDS);
      return reply(response, 503, {
        ...body,
        error:
          "The receiving system cannot be reached; the message was not sent, and is safe to send again.",
      });
    }
    case MllpErrorCode.SEND_TIMEOUT: {
      return reply(response, 504, {
        ...body,
        error:
          "The receiving system did not acknowledge the message in time; it may have received it, so check before sending it again.",
      });
    }
    case MllpErrorCode.CONNECTION_LOST:
    case MllpErrorCode.INVALID_RESPONSE:
    case MllpErrorCode.SEND_ABORTED: {
      return reply(response, 502, {
        ...body,
        error:
          "The exchange with the receiving system failed; it may have received the message, so check before sending it again.",
      });
    }
    case MllpErrorCode.INVALID_OPTION: {
      throw error;
    }
  }
}

/**
 * The body of `request` as text, or `undefined` when it is larger than
 * `MAX_BODY_BYTES`.
 */
async function read(request: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      return undefined;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function reply(response: ServerResponse, status: number, body: object): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
