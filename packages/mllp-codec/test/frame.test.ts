/**
 * Tests for `frame(payload)` — one-shot encoder. Scans the payload bytes
 * for reserved characters, then returns a fresh `Uint8Array` of
 * `<VT> payload <FS> <CR>`. Bytes in, bytes out: text is encoded upstream
 * (charset transparency is pinned in ./charset.test.ts).
 */

import { describe, expect, it } from "vitest";

import { CR, frame, MllpCodecError, FS, VT } from "../src/index";

describe("frame", () => {
  it("wraps a Uint8Array payload in VT + payload + FS+CR", () => {
    const out = frame(new Uint8Array([0x41, 0x42, 0x43]));
    expect(out).toEqual(new Uint8Array([VT, 0x41, 0x42, 0x43, FS, CR]));
  });

  it("handles an empty payload (still produces VT + FS+CR)", () => {
    expect(frame(new Uint8Array(0))).toEqual(new Uint8Array([VT, FS, CR]));
  });

  it("preserves CR bytes inside the payload (segment terminators)", () => {
    const msg = new Uint8Array([0x41, CR, 0x42]);
    const out = frame(msg);
    expect(out).toEqual(new Uint8Array([VT, 0x41, CR, 0x42, FS, CR]));
  });

  it("rejects a payload containing VT", () => {
    expect(() => frame(new Uint8Array([0x41, VT, 0x42]))).toThrow(
      expect.objectContaining({
        code: "RESERVED_CHARACTER",
        name: "MllpCodecError",
      })
    );
  });

  it("rejects a payload containing FS", () => {
    expect(() => frame(new Uint8Array([0x41, FS, 0x42]))).toThrow(
      expect.objectContaining({ code: "RESERVED_CHARACTER" })
    );
  });

  it("returns a fresh allocation each call (callers may mutate)", () => {
    const a = frame(new Uint8Array([0x41]));
    const b = frame(new Uint8Array([0x41]));
    expect(a).not.toBe(b);
    a[0] = 0xff;
    expect(b[0]).toBe(VT);
  });

  it("error is a MllpCodecError", () => {
    try {
      frame(new Uint8Array([VT]));
      expect.fail("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(MllpCodecError);
    }
  });
});
