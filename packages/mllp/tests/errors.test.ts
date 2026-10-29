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
      new MllpServerError(MllpServerErrorCode.PROTOCOL_VIOLATION).option
    ).toBeUndefined();
  });

  it("states that the connection is lost", () => {
    expect(
      new MllpServerError(MllpServerErrorCode.CONNECTION_LOST).message
    ).toBe(
      "The connection is lost before the remote system closes it; a message still in transit is not handled."
    );
  });

  it("states that the inbound message is not UTF-8", () => {
    expect(
      new MllpServerError(MllpServerErrorCode.INCOMPATIBLE_CHARSET).message
    ).toBe("The inbound message is not valid UTF-8; only UTF-8 is supported.");
  });

  it("states that no parser is registered", () => {
    expect(new MllpServerError(MllpServerErrorCode.NO_PARSER).message).toBe(
      "No parser is registered; `app.handle()` reads each message with the processor `app.parser()` is given."
    );
  });

  it("states that the byte stream is not framed as MLLP requires", () => {
    expect(
      new MllpServerError(MllpServerErrorCode.PROTOCOL_VIOLATION).message
    ).toBe(
      "The MLLP byte stream is not framed as MLLP requires, and the connection is closing; the error's cause says how."
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
