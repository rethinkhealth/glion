/**
 * The error vocabulary as a whole: one code per class, one delivery per code.
 */

import { describe, expect, it } from "vitest";

import {
  MllpClientClosedError,
  MllpClientError,
  MllpConnectionError,
  MllpConnectionFailedError,
  MllpConnectionLostError,
  MllpConnectionTimeoutError,
  MllpErrorCode,
  MllpInvalidMessageError,
  MllpInvalidOptionError,
  MllpInvalidResponseError,
  MllpSendAbortedError,
  MllpSendTimeoutError,
} from "../src/index";

const every: readonly [MllpClientError, string, "not-sent" | "unknown"][] = [
  [new MllpInvalidOptionError("x"), "INVALID_OPTION", "not-sent"],
  [new MllpInvalidMessageError(new Error("x")), "INVALID_MESSAGE", "not-sent"],
  [new MllpClientClosedError(), "CLOSED", "not-sent"],
  [
    new MllpConnectionFailedError(new Error("x")),
    "CONNECTION_FAILED",
    "not-sent",
  ],
  [new MllpConnectionTimeoutError(10), "CONNECTION_TIMEOUT", "not-sent"],
  [new MllpSendTimeoutError(10), "SEND_TIMEOUT", "unknown"],
  [new MllpConnectionLostError(), "CONNECTION_LOST", "unknown"],
  [new MllpSendAbortedError(), "SEND_ABORTED", "unknown"],
  [
    new MllpInvalidResponseError(new Error("x"), "MSG1"),
    "INVALID_RESPONSE",
    "unknown",
  ],
];

describe("MllpClientError", () => {
  it.each(every)(
    "%o carries its code and delivery",
    (failure, code, delivery) => {
      expect(failure.code).toBe(code);
      expect(failure.delivery).toBe(delivery);
      expect(failure.name).toBe(failure.constructor.name);
      expect(failure).toBeInstanceOf(MllpClientError);
    }
  );

  it("covers every code once", () => {
    const codes = every.map(([, code]) => code).toSorted();
    expect(codes).toEqual(Object.values(MllpErrorCode).toSorted());
  });

  it("keeps the wire's failures in one family", () => {
    const wire = every
      .filter(([failure]) => failure instanceof MllpConnectionError)
      .map(([, code]) => code)
      .toSorted();
    expect(wire).toEqual([
      "CONNECTION_FAILED",
      "CONNECTION_LOST",
      "CONNECTION_TIMEOUT",
      "SEND_TIMEOUT",
    ]);
  });
});
