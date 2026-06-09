/**
 * Unit tests for the inbound ACK codec (`src/util/ack.ts`). These drive
 * `parseResponse` directly — no client, no wire — so each branch of the
 * decode → parse → MSA-1 → correlate → accept/NAK pipeline is exercised in
 * isolation, including the precedence between failure modes that the full
 * client tests can't easily target.
 */

import {
  AckApplicationError,
  AckApplicationReject,
  AckCommitError,
  AckCommitReject,
  AckException,
} from "@glion/ack";

import { parseResponse } from "../src/ack";
import { MllpClientError, MllpErrorCode } from "../src/errors";
import {
  ACK_AA,
  ACK_AA_EMPTY_CONTROL,
  ACK_AA_WRONG_CONTROL,
  ACK_AE,
  ACK_AE_WITH_ERR,
  ACK_AR,
  ACK_CA,
  ACK_CE,
  ACK_CR,
  ACK_EMPTY_CODE,
  ACK_NO_MSA,
  ACK_UNKNOWN_CODE,
  REQUEST_CONTROL_ID,
} from "./fixtures";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

/** Build an ACK with explicit code / control-id / segment terminator. */
function buildAck(
  code: string,
  controlId = REQUEST_CONTROL_ID,
  terminator = "\r"
): string {
  return [
    "MSH|^~\\&|RECV|RFAC|SENDER|FAC|20241201120001||ACK^A01^ACK|ACK999|P|2.5",
    `MSA|${code}|${controlId}`,
  ].join(terminator);
}

// ---------------------------------------------------------------------------
// Decode boundary (strict UTF-8)
// ---------------------------------------------------------------------------

describe("parseResponse — decode", () => {
  it("throws INVALID_RESPONSE with the CharsetError on cause for non-UTF-8 bytes", () => {
    // 0xFF is never a valid UTF-8 byte; decodeBytes is fatal, so it must not
    // be silently substituted with U+FFFD (issue #659).
    const garbage = new Uint8Array([0x4d, 0x53, 0x48, 0xff]);
    try {
      parseResponse(garbage, REQUEST_CONTROL_ID);
      expect.fail("parseResponse should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MllpClientError);
      expect((error as MllpClientError).code).toBe(
        MllpErrorCode.INVALID_RESPONSE
      );
      // The underlying CharsetError is preserved for diagnostics; the codec
      // does not leak the charset type in its own message.
      expect((error as MllpClientError).cause).toBeInstanceOf(Error);
    }
  });

  it("strips a leading UTF-8 BOM and still resolves", () => {
    // EF BB BF is a UTF-8 BOM. decodeBytes drops it, so the MSH segment is not
    // corrupted and MSA-1 is still found.
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...encode(ACK_AA)]);
    const result = parseResponse(withBom, REQUEST_CONTROL_ID);
    expect(result.code).toBe("AA");
  });
});

// ---------------------------------------------------------------------------
// Missing / unusable MSA-1
// ---------------------------------------------------------------------------

describe("parseResponse — missing MSA-1", () => {
  it("throws INVALID_RESPONSE for empty payload bytes", () => {
    expect(() => parseResponse(new Uint8Array(), REQUEST_CONTROL_ID)).toThrow(
      MllpClientError
    );
    try {
      parseResponse(new Uint8Array(), REQUEST_CONTROL_ID);
    } catch (error) {
      expect((error as MllpClientError).code).toBe(
        MllpErrorCode.INVALID_RESPONSE
      );
    }
  });

  it("throws INVALID_RESPONSE when there is no MSA segment", () => {
    try {
      parseResponse(encode(ACK_NO_MSA), REQUEST_CONTROL_ID);
      expect.fail("parseResponse should have thrown");
    } catch (error) {
      expect((error as MllpClientError).code).toBe(
        MllpErrorCode.INVALID_RESPONSE
      );
    }
  });

  it("throws INVALID_RESPONSE when MSA-1 is present but empty", () => {
    try {
      parseResponse(encode(ACK_EMPTY_CODE), REQUEST_CONTROL_ID);
      expect.fail("parseResponse should have thrown");
    } catch (error) {
      expect((error as MllpClientError).code).toBe(
        MllpErrorCode.INVALID_RESPONSE
      );
    }
  });

  it("treats non-HL7v2 text as a parseable-but-MSA-less ACK (INVALID_RESPONSE)", () => {
    // The parser is lenient and never throws; the failure surfaces as the
    // no-MSA-1 check, not as a parser exception.
    try {
      parseResponse(encode("this is not an HL7 message"), REQUEST_CONTROL_ID);
      expect.fail("parseResponse should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MllpClientError);
      expect((error as MllpClientError).code).toBe(
        MllpErrorCode.INVALID_RESPONSE
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Unknown MSA-1 code
// ---------------------------------------------------------------------------

describe("parseResponse — unknown code", () => {
  it("throws INVALID_RESPONSE for a code outside the standard six", () => {
    try {
      parseResponse(encode(ACK_UNKNOWN_CODE), REQUEST_CONTROL_ID);
      expect.fail("parseResponse should have thrown");
    } catch (error) {
      expect((error as MllpClientError).code).toBe(
        MllpErrorCode.INVALID_RESPONSE
      );
    }
  });

  it("is case-sensitive — lowercase 'aa' is unknown, not an accept", () => {
    // HL7v2 acknowledgment codes are uppercase; the codec does not normalise
    // case, so a non-conformant lowercase code is rejected rather than coerced.
    try {
      parseResponse(encode(buildAck("aa")), REQUEST_CONTROL_ID);
      expect.fail("parseResponse should have thrown");
    } catch (error) {
      expect((error as MllpClientError).code).toBe(
        MllpErrorCode.INVALID_RESPONSE
      );
    }
  });

  it("does not trim surrounding whitespace in MSA-1", () => {
    // No trimming: " AA " is not the literal code "AA".
    try {
      parseResponse(encode(buildAck(" AA ")), REQUEST_CONTROL_ID);
      expect.fail("parseResponse should have thrown");
    } catch (error) {
      expect((error as MllpClientError).code).toBe(
        MllpErrorCode.INVALID_RESPONSE
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Accept codes (AA / CA)
// ---------------------------------------------------------------------------

describe("parseResponse — accepts", () => {
  it("returns the parsed accept for AA", () => {
    const result = parseResponse(encode(ACK_AA), REQUEST_CONTROL_ID);
    expect(result.code).toBe("AA");
    expect(result.controlId).toBe(REQUEST_CONTROL_ID);
    expect(result.raw).toBe(ACK_AA);
    expect(result.tree.children.length).toBeGreaterThan(0);
  });

  it("returns the parsed accept for CA", () => {
    const result = parseResponse(encode(ACK_CA), REQUEST_CONTROL_ID);
    expect(result.code).toBe("CA");
  });

  it("returns no wire timing — that is the connection's to attach", () => {
    // ParsedAck deliberately omits timestamp/durationMs; the exchange measures
    // and adds them when it builds the MllpClientResponse.
    const result = parseResponse(encode(ACK_AA), REQUEST_CONTROL_ID);
    expect("timestamp" in result).toBe(false);
    expect("durationMs" in result).toBe(false);
  });

  it("reads MSA-2 at the component level (echoed first component)", () => {
    // A peer that echoes "MSG001^extra" correlates to "MSG001"; the codec reads
    // the first component, never the raw field.
    const ack = buildAck("AA", `${REQUEST_CONTROL_ID}^extra`);
    const result = parseResponse(encode(ack), REQUEST_CONTROL_ID);
    expect(result.code).toBe("AA");
    expect(result.controlId).toBe(REQUEST_CONTROL_ID);
  });
});

// ---------------------------------------------------------------------------
// NAK codes (AE / AR / CE / CR)
// ---------------------------------------------------------------------------

const NAK_CASES = [
  { ack: ACK_AE, code: "AE", errorClass: AckApplicationError },
  { ack: ACK_AR, code: "AR", errorClass: AckApplicationReject },
  { ack: ACK_CE, code: "CE", errorClass: AckCommitError },
  { ack: ACK_CR, code: "CR", errorClass: AckCommitReject },
] as const;

describe("parseResponse — NAKs", () => {
  it.each(NAK_CASES)(
    "throws the $code AckException subclass",
    ({ ack, code, errorClass }) => {
      try {
        parseResponse(encode(ack), REQUEST_CONTROL_ID);
        expect.fail("parseResponse should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AckException);
        expect(error).toBeInstanceOf(errorClass);
        const nak = error as AckException;
        expect(nak.code).toBe(code);
        expect(nak.controlId).toBe(REQUEST_CONTROL_ID);
        expect(typeof nak.raw).toBe("string");
        expect(nak.tree).toBeDefined();
      }
    }
  );

  it("carries ERR-3 errorCode and ERR-4 severity when an ERR segment is present", () => {
    try {
      parseResponse(encode(ACK_AE_WITH_ERR), REQUEST_CONTROL_ID);
      expect.fail("parseResponse should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AckApplicationError);
      const nak = error as AckException;
      expect(nak.errorCode).toBe("204");
      expect(nak.severity).toBe("E");
    }
  });

  it("leaves errorCode/severity undefined when the NAK has no ERR segment", () => {
    // ACK_AR is MSA|AR|MSG001 with no ERR; readValue → null → undefined.
    try {
      parseResponse(encode(ACK_AR), REQUEST_CONTROL_ID);
      expect.fail("parseResponse should have thrown");
    } catch (error) {
      const nak = error as AckException;
      expect(nak.errorCode).toBeUndefined();
      expect(nak.severity).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Correlation (MSH-10 ↔ MSA-2)
// ---------------------------------------------------------------------------

describe("parseResponse — correlation", () => {
  it("resolves when both control ids match", () => {
    const result = parseResponse(encode(ACK_AA), REQUEST_CONTROL_ID);
    expect(result.controlId).toBe(REQUEST_CONTROL_ID);
  });

  it("throws INVALID_RESPONSE when both ids are present and disagree", () => {
    try {
      parseResponse(encode(ACK_AA_WRONG_CONTROL), REQUEST_CONTROL_ID);
      expect.fail("parseResponse should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MllpClientError);
      const mismatch = error as MllpClientError;
      expect(mismatch.code).toBe(MllpErrorCode.INVALID_RESPONSE);
      // The control-id mismatch is one flavour of INVALID_RESPONSE; the message
      // is what distinguishes it from the other flavours.
      expect(mismatch.message).toMatch(/control-ID mismatch/i);
    }
  });

  it("resolves when the peer omits MSA-2 (empty response-side id)", () => {
    // Real-world compat: some older peers don't echo the control id.
    const result = parseResponse(
      encode(ACK_AA_EMPTY_CONTROL),
      REQUEST_CONTROL_ID
    );
    expect(result.code).toBe("AA");
    expect(result.controlId).toBe("");
  });

  it("resolves when we sent no MSH-10 (empty expected id)", () => {
    // The request carried no control id, so there is nothing to disagree with.
    const result = parseResponse(encode(ACK_AA), "");
    expect(result.code).toBe("AA");
    expect(result.controlId).toBe(REQUEST_CONTROL_ID);
  });

  it("resolves when neither side has a control id", () => {
    const result = parseResponse(encode(ACK_AA_EMPTY_CONTROL), "");
    expect(result.code).toBe("AA");
    expect(result.controlId).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Failure-mode precedence
// ---------------------------------------------------------------------------

// All four unusable-reply situations share the INVALID_RESPONSE code, so the
// `message` is the only observable that distinguishes them. These tests pin the
// ORDER the checks run in by asserting which message wins when more than one
// fault is present at once.
describe("parseResponse — precedence between failures", () => {
  it("reports the control-id mismatch, not the NAK, for a mismatched NAK", () => {
    // A NAK whose MSA-2 doesn't match our MSH-10 is almost certainly a late ACK
    // from a previously-timed-out request — it must NOT surface as a rejection
    // of the message we just sent. Correlation is checked before NAK dispatch.
    const mismatchedNak = buildAck("AE", "OTHER");
    try {
      parseResponse(encode(mismatchedNak), REQUEST_CONTROL_ID);
      expect.fail("parseResponse should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MllpClientError);
      expect(error).not.toBeInstanceOf(AckException);
      const e = error as MllpClientError;
      expect(e.code).toBe(MllpErrorCode.INVALID_RESPONSE);
      expect(e.message).toMatch(/control-ID mismatch/i);
    }
  });

  it("reports the unknown code before the control-id mismatch", () => {
    // The code is validated before the control id is even read.
    const unknownAndMismatched = buildAck("OK", "OTHER");
    try {
      parseResponse(encode(unknownAndMismatched), REQUEST_CONTROL_ID);
      expect.fail("parseResponse should have thrown");
    } catch (error) {
      const e = error as MllpClientError;
      expect(e.code).toBe(MllpErrorCode.INVALID_RESPONSE);
      expect(e.message).toMatch(/unknown acknowledgment code "OK"/i);
    }
  });

  it("reports the missing MSA-1 before the control-id mismatch", () => {
    const emptyCodeMismatched = buildAck("", "OTHER");
    try {
      parseResponse(encode(emptyCodeMismatched), REQUEST_CONTROL_ID);
      expect.fail("parseResponse should have thrown");
    } catch (error) {
      const e = error as MllpClientError;
      expect(e.code).toBe(MllpErrorCode.INVALID_RESPONSE);
      expect(e.message).toMatch(/no MSA-1/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Line-ending robustness
// ---------------------------------------------------------------------------

describe("parseResponse — segment terminators", () => {
  it.each([
    { label: "LF", terminator: "\n" },
    { label: "CRLF", terminator: "\r\n" },
  ])("finds MSA-1 with $label line endings", ({ terminator }) => {
    // The parser normalises \n and \r\n to the segment delimiter, so a peer
    // that doesn't use a bare CR still correlates.
    const ack = buildAck("AA", REQUEST_CONTROL_ID, terminator);
    const result = parseResponse(encode(ack), REQUEST_CONTROL_ID);
    expect(result.code).toBe("AA");
    expect(result.controlId).toBe(REQUEST_CONTROL_ID);
  });
});

// ---------------------------------------------------------------------------
// KNOWN LIMITATION: no HL7v2 conformance validation of the ACK
// ---------------------------------------------------------------------------
//
// parseResponse only decodes, parses, reads MSA-1 / MSA-2 / ERR-3 / ERR-4, and
// correlates the control id. It performs NO conformance validation: it does not
// check that the message is actually an acknowledgment (MSH-9 = ACK), that an
// MSH header is present or well-formed, that the HL7 version is compatible, or
// that any segment/field is profile-conformant. As long as a segment named
// `MSA` carries a recognised code in MSA-1, the response is accepted.
//
// These tests pin that permissive behaviour so the limitation is explicit and a
// future change to add validation is a deliberate, visible decision.

describe("parseResponse — no conformance validation (known limitation)", () => {
  it("accepts a message whose MSH-9 type is NOT an acknowledgment", () => {
    // An ADT^A01 (not ACK^...) that happens to carry MSA|AA is accepted; the
    // codec never inspects the message type.
    const notAnAck = [
      "MSH|^~\\&|R|F|S|SF|20240101||ADT^A01^ADT_A01|X1|P|2.5",
      `MSA|AA|${REQUEST_CONTROL_ID}`,
    ].join("\r");
    const result = parseResponse(encode(notAnAck), REQUEST_CONTROL_ID);
    expect(result.code).toBe("AA");
    expect(result.controlId).toBe(REQUEST_CONTROL_ID);
  });

  it("accepts a bare MSA segment with no MSH header at all", () => {
    // No MSH means no declared delimiters and no message header — a structurally
    // invalid HL7v2 message. The parser falls back to default delimiters and the
    // codec still finds MSA-1, so it resolves.
    const result = parseResponse(encode("MSA|AA|MSG001"), "MSG001");
    expect(result.code).toBe("AA");
    expect(result.controlId).toBe("MSG001");
  });

  it("accepts an MSA buried after unrelated segments", () => {
    const result = parseResponse(encode("PID|1||x\rMSA|AA|MSG001"), "MSG001");
    expect(result.code).toBe("AA");
  });

  it("silently uses the FIRST MSA when the peer sends conflicting ones", () => {
    // A non-conformant ACK with two MSA segments (AA then AE) is not rejected as
    // ambiguous — MSA-1[1] wins, so a contradicting AE is never seen.
    const conflicting = [
      "MSH|^~\\&|R|F|S|SF|20240101||ACK^A01^ACK|X1|P|2.5",
      "MSA|AA|MSG001",
      "MSA|AE|MSG001",
    ].join("\r");
    const result = parseResponse(encode(conflicting), "MSG001");
    expect(result.code).toBe("AA");
  });
});
