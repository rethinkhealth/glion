import { describe, expect, it } from "vitest";

import { MllpServerError, MllpServerErrorCode } from "../src/errors";

describe("MllpServerError", () => {
  it("states that the handle option is not a function, and names the option", () => {
    const error = new MllpServerError(MllpServerErrorCode.INVALID_OPTION, {
      option: "handle",
    });
    expect(error.message).toBe(
      "The `handle` option is not a function; `serve()` replies to each message with the `handle` it is given, as in `serve({ handle: app.handle, port: 2575 })`."
    );
    expect(error.option).toBe("handle");
  });

  it("states that the port option is not a TCP port, and names the option", () => {
    const error = new MllpServerError(MllpServerErrorCode.INVALID_OPTION, {
      option: "port",
    });
    expect(error.message).toBe(
      "The `port` option is not an integer from 0 to 65535; `serve()` listens on the TCP port it is given, as in `serve({ handle: app.handle, port: 2575 })`."
    );
    expect(error.option).toBe("port");
  });

  it("names no option for any other code", () => {
    expect(
      new MllpServerError(MllpServerErrorCode.NEXT_CALLED_TWICE).option
    ).toBeUndefined();
  });

  it("states that a middleware called next() a second time", () => {
    expect(
      new MllpServerError(MllpServerErrorCode.NEXT_CALLED_TWICE).message
    ).toBe(
      "A middleware called `next()` a second time; a middleware calls `next()` at most once."
    );
  });

  it("states that the byte stream is not framed as MLLP requires", () => {
    expect(
      new MllpServerError(MllpServerErrorCode.PROTOCOL_VIOLATION).message
    ).toBe(
      "The MLLP byte stream is not framed as MLLP requires, and the connection is closing; the error's cause says how."
    );
  });

  it("states that the value given as the response is not an MllpResponse", () => {
    expect(
      new MllpServerError(MllpServerErrorCode.INVALID_RESPONSE).message
    ).toBe(
      "The value given as the response is not an `MllpResponse`; a response is built by `ctx.ack()` or `ctx.reply()`."
    );
  });

  it("states that the response's MSA-1 is a NAK code", () => {
    expect(
      new MllpServerError(MllpServerErrorCode.RESPONSE_IS_NAK).message
    ).toBe(
      "The response's acknowledgment code (MSA-1) is a NAK code; a response accepts the message, and a NAK is the response to a thrown error."
    );
  });

  it("states that the response does not start with an MSH", () => {
    expect(
      new MllpServerError(MllpServerErrorCode.RESPONSE_WITHOUT_MSH).message
    ).toBe(
      "The response does not start with the message header segment (`MSH`); an HL7v2 message starts with one."
    );
  });

  it("keeps its code, its name, and the cause it is given", () => {
    const cause = new Error("codec");
    const error = new MllpServerError(MllpServerErrorCode.PROTOCOL_VIOLATION, {
      cause,
    });
    expect(error.code).toBe("PROTOCOL_VIOLATION");
    expect(error.name).toBe("MllpServerError");
    expect(error.cause).toBe(cause);
  });
});
