/**
 * Send-side message preparation. The AST (`Root`) is the first-class send
 * currency: every `send()` input is normalized to a tree and the wire bytes are
 * produced from that tree with `@glion/to-hl7v2`. The client is therefore an
 * *originating / cleaning* client — it emits canonical HL7v2, not a byte-exact
 * relay of whatever arrived. A `string` is parsed (it is a serialized tree); a
 * `Root` is used directly. Raw bytes are NOT accepted: a caller holding wire
 * bytes decodes them to text at its own I/O boundary (where charset / MSH-18
 * knowledge lives) and passes the `string`.
 *
 * **What "cleaning" changes** (syntactic only — semantics are preserved):
 * line endings are normalized to CR, and trailing empty fields / segments are
 * trimmed. Escape sequences (`\F\`, `\X0D\`, …), Z-segments, repetitions, and
 * components are preserved verbatim by the parser→serializer round trip.
 *
 * **Known limitations** (documented, accepted):
 *
 * - Trailing-empty-field trimming is NOT idempotent — it drops one trailing empty
 *   field per pass (`PID|1|||||` → `PID|1||||` → … → `PID|1`), so cleaning the
 *   same message twice can yield different bytes. Semantically faithful (the
 *   fields are absent either way); syntactically non-convergent.
 * - **Decode-implies-encode invariant:** the client parses with the base
 *   `@glion/parser`, which does NOT decode escape sequences — so `\F\` in →
 *   `\F\` out, no re-encode needed. Do NOT hand `send()` a `Root` that has
 *   already been escape-decoded (e.g. via `hl7v2DecodeEscapes`): `toHl7v2` has
 *   no re-encode step and would emit the decoded literal, corrupting field
 *   structure.
 *
 * @module
 */

import type { Root } from "@glion/ast";
import { frame } from "@glion/mllp-transport";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { value } from "@glion/util-query";

/**
 * What `MllpClient.send()` accepts — a `string` (serialized HL7v2 text) or a
 * `Root` (a parsed tree). Both are normalized to a tree and serialized to
 * canonical HL7v2 for the wire (see the module JSDoc): a `string` is parsed; a
 * `Root` is used directly. Raw bytes are NOT accepted — decode them to text at
 * your I/O boundary (where charset / MSH-18 knowledge lives) and pass the
 * `string`.
 */
export type SendInput = string | Root;

/**
 * Parse a send input into a tree at the client boundary. A `string` is parsed
 * (it is serialized HL7v2 text); a `Root` is returned as-is. This is the ONLY
 * place a `string` enters the client — `client.send()` calls it once, and
 * everything past the boundary (the manager, the queue, {@link prepareSend})
 * works on a `Root`.
 */
export function toTree(input: SendInput): Root {
  if (typeof input !== "string") {
    return input;
  }
  // The parser is lenient — it never throws — so a tree is always produced,
  // even for non-HL7v2 text (MSH-10 then reads as "").
  return parseHL7v2(input);
}

/**
 * Serialize a parsed message to its canonical MLLP wire bytes. The tree is
 * serialized with `@glion/to-hl7v2` and MLLP-framed — the bytes are the
 * *cleaned* canonical form, not a byte-exact echo of any prior wire form (see
 * the module JSDoc). The input is always a `Root`: a `string` is parsed at the
 * boundary ({@link toTree}), never here.
 *
 * @throws {FramingError} When the serialized message carries an embedded MLLP
 *   framing byte (VT or FS) that cannot be framed. CR is allowed — it is the
 *   HL7v2 segment terminator.
 */
export function toWireBytes(tree: Root): Uint8Array {
  return frame(toHl7v2(tree));
}

/**
 * The request's HL7v2 control ID (MSH-10), used to correlate the eventual ACK
 * (matched against the response's MSA-2). `""` when absent — the lenient parser
 * never throws, so non-HL7v2 input simply has no MSH-10. Read from the SAME
 * tree that {@link toWireBytes} serializes.
 */
export function requestControlId(tree: Root): string {
  return value(tree, "MSH-10[1].1.1")?.value ?? "";
}
