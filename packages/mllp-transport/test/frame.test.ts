/**
 * Tests for `frame(payload)` — one-shot encoder. Validates the
 * payload, then returns a fresh `Uint8Array` of
 * `<VT> payload <FS> <CR>`.
 */

import { describe, expect, it } from "vitest";

import { CR, frame, FramingError, FS, VT } from "../src/index";

describe("frame", () => {
  it("wraps a Uint8Array payload in VT + payload + FS+CR", () => {
    const out = frame(new Uint8Array([0x41, 0x42, 0x43]));
    expect(out).toEqual(new Uint8Array([VT, 0x41, 0x42, 0x43, FS, CR]));
  });

  it("handles an empty payload (still produces VT + FS+CR)", () => {
    expect(frame(new Uint8Array(0))).toEqual(new Uint8Array([VT, FS, CR]));
  });

  it("UTF-8 encodes string input", () => {
    expect(frame("ABC")).toEqual(
      new Uint8Array([VT, 0x41, 0x42, 0x43, FS, CR])
    );
  });

  it("UTF-8 encodes multi-byte characters correctly", () => {
    // 'é' encodes to 0xC3 0xA9.
    expect(frame("é")).toEqual(new Uint8Array([VT, 0xc3, 0xa9, FS, CR]));
  });

  it("preserves CR bytes inside the payload (segment terminators)", () => {
    const msg = new Uint8Array([0x41, CR, 0x42]);
    const out = frame(msg);
    expect(out).toEqual(new Uint8Array([VT, 0x41, CR, 0x42, FS, CR]));
  });

  it("rejects a payload containing VT", () => {
    expect(() => frame(new Uint8Array([0x41, VT, 0x42]))).toThrowError(
      expect.objectContaining({ code: "EMBEDDED_CONTROL_CHAR" })
    );
  });

  it("rejects a payload containing FS", () => {
    expect(() => frame(new Uint8Array([0x41, FS, 0x42]))).toThrowError(
      expect.objectContaining({ code: "EMBEDDED_CONTROL_CHAR" })
    );
  });

  it("returns a fresh allocation each call (callers may mutate)", () => {
    const a = frame(new Uint8Array([0x41]));
    const b = frame(new Uint8Array([0x41]));
    expect(a).not.toBe(b);
    a[0] = 0xff;
    expect(b[0]).toBe(VT);
  });

  it("error is a FramingError", () => {
    try {
      frame(new Uint8Array([VT]));
      expect.fail("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(FramingError);
    }
  });
});
