/**
 * Regression for https://github.com/rethinkhealth/glion/issues/723.
 *
 * Date: 2026-09-15
 * Symptom: `glion send` reported a message the client refused to prepare
 * (no MSH-10, or a reserved MLLP byte) as the `transport` outcome, so a JSON
 * consumer could not tell a bad message from a dead network. The 0.18.0
 * release notes had already promised `invalid`.
 * Cause: `MllpInvalidMessageError` extends `MllpClientError`, and the outcome
 * mapping had no arm for it before the `MllpClientError` arm.
 * Resolution: an unsendable message is the `invalid` outcome, carrying the
 * client's `INVALID_MESSAGE` code and the reason.
 */

import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { runSend } from "../../src/commands/send";
import { ADT, ackFrame, capture, fakeSocket } from "../fixtures/send";

const VT = "";

describe("glion send with a message the client cannot prepare", () => {
  it("reports a message without MSH-10 as invalid, with the client's code", async () => {
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      cwd: "/tmp",
      socket: fakeSocket(ackFrame("AA")),
      stderr,
      stdin: Readable.from(ADT.replace("|MSG00001|", "||")),
      stdout,
    });

    expect(code).toBe(2);
    const json = JSON.parse(state.out);
    expect(json.kind).toBe("invalid");
    expect(json.code).toBe("INVALID_MESSAGE");
    expect(json.cause).toContain("MSH-10");
  });

  it("reports a Segment ID with a reserved VT byte as invalid, with the client's code", async () => {
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      cwd: "/tmp",
      socket: fakeSocket(ackFrame("AA")),
      stderr,
      // Since #1001 a control character in a value is encoded as \X0B\ and
      // sent; one in a Segment ID still cannot be, so the client refuses it.
      stdin: Readable.from(`${ADT}\rNT${VT}E|1||free text`),
      stdout,
    });

    expect(code).toBe(2);
    const json = JSON.parse(state.out);
    expect(json.kind).toBe("invalid");
    expect(json.code).toBe("INVALID_MESSAGE");
    // The control id of the message that was refused, so a consumer can tell
    // which one it was.
    expect(json.requestControlId).toBe("MSG00001");
  });

  it("prints the reason under the diagnostic line on a TTY", async () => {
    const { state, stderr, stdout } = capture(true);
    await runSend({
      argv: ["--host", "h", "--port", "1"],
      cwd: "/tmp",
      socket: fakeSocket(ackFrame("AA")),
      stderr,
      stdin: Readable.from(ADT.replace("|MSG00001|", "||")),
      stdout,
    });

    expect(state.err).toMatch(/^x {2}.*INVALID_MESSAGE/);
    expect(state.err).toContain("MSH-10");
  });
});
